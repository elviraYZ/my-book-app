/**
 * LLM provider abstraction：只负责「给 system+user → 返回 JSON 文本」。
 * 推荐 pipeline 只调用 completeJson，不直接碰 Gemini/OpenAI SDK。
 */

import {
  getAiApiKey,
  getAiProvider,
  getLlmModel,
  getLlmTimeoutMs,
  type AiProvider,
} from "@/lib/ai/config";
import {
  isAiNetworkFailed,
  isNetworkishError,
  markAiNetworkFailed,
} from "@/lib/ai/request-state";
import { proxyFetch } from "@/lib/server/proxy-fetch";

export type CompleteJsonInput = {
  system: string;
  user: string;
  temperature?: number;
};

/**
 * 调用当前 AI provider，期望返回可 JSON.parse 的对象。
 * 失败抛错，由调用方 fallback。
 */
export async function completeJson(
  input: CompleteJsonInput,
): Promise<unknown> {
  if (isAiNetworkFailed()) {
    throw new Error("AI network previously failed in this request");
  }

  const provider = getAiProvider();
  const apiKey = getAiApiKey(provider);
  if (!apiKey) {
    throw new Error(`AI provider ${provider}: missing API key`);
  }

  const model = getLlmModel(provider);
  const timeoutMs = getLlmTimeoutMs();
  console.log(`[llm] provider=${provider} model=${model} timeoutMs=${timeoutMs}`);

  try {
    if (provider === "gemini") {
      return await completeJsonGemini(apiKey, model, input, timeoutMs);
    }
    return await completeJsonOpenAi(apiKey, model, input, timeoutMs);
  } catch (err) {
    if (isNetworkishError(err)) markAiNetworkFailed();
    throw err;
  }
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim()) as unknown;
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw new Error("LLM content is not valid JSON");
  }
}

async function completeJsonGemini(
  apiKey: string,
  model: string,
  input: CompleteJsonInput,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await proxyFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: input.system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input.user }],
          },
        ],
        generationConfig: {
          temperature: input.temperature ?? 0.2,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
      }[];
    };
    const content = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!content) throw new Error("Gemini empty content");
    return parseJsonContent(content);
  } finally {
    clearTimeout(timer);
  }
}

async function completeJsonOpenAi(
  apiKey: string,
  model: string,
  input: CompleteJsonInput,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await proxyFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: input.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenAI empty content");
    return parseJsonContent(content);
  } finally {
    clearTimeout(timer);
  }
}

export function describeLlmProvider(): {
  provider: AiProvider;
  model: string;
  configured: boolean;
} {
  const provider = getAiProvider();
  return {
    provider,
    model: getLlmModel(provider),
    configured: Boolean(getAiApiKey(provider)),
  };
}
