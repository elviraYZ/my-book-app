/**
 * 服务端 fetch：有 HTTPS_PROXY / HTTP_PROXY 时走 undici ProxyAgent。
 * undici 仅动态 import，避免进入 Client Component bundle。
 */

let cachedAgent: unknown;
let agentResolved = false;
let proxyLogged = false;

function getProxyUrl(): string | null {
  return (
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.ALL_PROXY?.trim() ||
    null
  );
}

function redactProxyUrl(url: string): string {
  return url.replace(/\/\/([^/@]+)@/, "//***@");
}

/**
 * 服务端 fetch：有代理时走 ProxyAgent；浏览器 / 无代理时用全局 fetch。
 */
export async function proxyFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof window !== "undefined") {
    return fetch(input, init);
  }

  const proxy = getProxyUrl();
  if (!proxy) {
    return fetch(input, init);
  }

  const undici = await import("undici");
  if (!agentResolved) {
    cachedAgent = new undici.ProxyAgent(proxy);
    agentResolved = true;
    if (!proxyLogged) {
      proxyLogged = true;
      console.log(`[proxy] enabled ${redactProxyUrl(proxy)}`);
    }
  }

  const res = await undici.fetch(input, {
    ...(init as Parameters<typeof undici.fetch>[1]),
    dispatcher: cachedAgent as import("undici").ProxyAgent,
  });
  return res as unknown as Response;
}

export function isProxyConfigured(): boolean {
  return typeof window === "undefined" && Boolean(getProxyUrl());
}
