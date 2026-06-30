import { fetchWithTimeout } from "../integrations/http.js";

const URL_RE = /https?:\/\/[^\s，。"'<>]+/i;
const COMMERCE_URL_RE = /https?:\/\/(?:item\.taobao\.com|item\.jd\.com|item\.m\.jd\.com|m\.tb\.cn|e\.tb\.cn|u\.jd\.com|3\.cn)\/[^\s"'<>]+/i;

export async function resolveDealCopyValue(copyValue: string, fetcher: typeof fetch = fetch): Promise<string> {
  const value = copyValue.trim();
  const url = value.match(URL_RE)?.[0];
  if (!url) return value;

  try {
    const response = await fetchWithTimeout(
      fetcher,
      url,
      {
        method: "GET",
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
        }
      },
      10000
    );
    const finalUrl = response.url || url;
    if (isCommerceUrl(finalUrl)) return finalUrl.trim();

    const html = await response.text().catch(() => "");
    const embedded = html.match(COMMERCE_URL_RE)?.[0];
    if (embedded) return embedded;

    return finalUrl.trim() || value;
  } catch {
    return value;
  }
}

function isCommerceUrl(url: string): boolean {
  return COMMERCE_URL_RE.test(url);
}
