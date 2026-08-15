/**
 * 最小 Gemini 连通性探测（不走 recommend pipeline）。
 *
 *   npm run test:gemini
 *   npm run test:gemini -- gemini-3.5-flash-lite
 */

import { ProxyAgent, setGlobalDispatcher } from "undici";

function setupProxyFromEnv() {
  const proxy =
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.ALL_PROXY?.trim();
  if (!proxy) {
    console.log("[test-gemini] no HTTP(S)_PROXY");
    return;
  }
  setGlobalDispatcher(new ProxyAgent(proxy));
  console.log(
    `[test-gemini] proxy ${proxy.replace(/\/\/([^/@]+)@/, "//***@")}`,
  );
}

async function main() {
  setupProxyFromEnv();

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少 GEMINI_API_KEY");
  }

  const model =
    process.argv[2]?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-3.5-flash";

  console.log(`[test-gemini] model=${model}`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const started = Date.now();

  const controller = new AbortController();
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 45_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: 'Return JSON only: {"ok": true}' }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    const body = await res.text();
    const ms = Date.now() - started;
    console.log(`[test-gemini] status=${res.status} in ${ms}ms`);
    console.log(body.slice(0, 800));

    if (!res.ok) process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((err) => {
  console.error("[test-gemini] failed:", err);
  process.exit(1);
});
