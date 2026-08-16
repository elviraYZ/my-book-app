/** 书籍来源链接规范化（仅用库内 info / preview，不拼搜索） */

function normalizeExternalUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    if (u.protocol === "http:") u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}

/** 仅用来源页 info_url（不回退到试读 / 搜索 / ISBN） */
export function getBookSourceUrl(book: {
  info_url?: string | null;
  preview_url?: string | null;
}): string | null {
  return normalizeExternalUrl(book.info_url);
}

export function tryOpenExternalUrl(href: string): boolean {
  if (typeof window === "undefined") return false;
  const url = normalizeExternalUrl(href);
  if (!url) return false;
  const win = window.open(url, "_blank", "noopener,noreferrer");
  return win != null;
}
