import { fetchWithTimeout } from "../integrations/http.js";

const URL_RE = /https?:\/\/[^\s，。"'<>]+/i;
const COMMERCE_URL_RE = /https?:\/\/(?:item\.taobao\.com|item\.jd\.com|item\.m\.jd\.com|m\.tb\.cn|e\.tb\.cn|u\.jd\.com|3\.cn)\/[^\s"'<>]+/i;
const JS_LOCATION_RE = /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i;
const SHORT_LINK_TIMEOUT_MS = 20000;

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
      SHORT_LINK_TIMEOUT_MS
    );
    const finalUrl = response.url || url;
    if (isCommerceUrl(finalUrl)) return finalUrl.trim();

    const html = await response.text().catch(() => "");
    const embedded = html.match(COMMERCE_URL_RE)?.[0];
    if (embedded) return embedded;

    const jsLocation = html.match(JS_LOCATION_RE)?.[1];
    if (jsLocation) {
      const nested = await resolveExpandedUrl(jsLocation, fetcher);
      if (nested) return nested;
    }

    return finalUrl.trim() || value;
  } catch {
    return value;
  }
}

async function resolveExpandedUrl(url: string, fetcher: typeof fetch): Promise<string | undefined> {
  if (isCommerceUrl(url)) return url.trim();

  const superPage = await resolveIyunzkSuperPage(url, fetcher);
  if (superPage) return superPage;

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
    SHORT_LINK_TIMEOUT_MS
  );
  const finalUrl = response.url || url;
  if (isCommerceUrl(finalUrl)) return finalUrl.trim();

  const html = await response.text().catch(() => "");
  const embedded = html.match(COMMERCE_URL_RE)?.[0];
  if (embedded) return embedded;

  return html.match(JS_LOCATION_RE)?.[1];
}

async function resolveIyunzkSuperPage(url: string, fetcher: typeof fetch): Promise<string | undefined> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!/oss\.taobyhq\.com$/i.test(parsed.hostname)) return undefined;

  const key = readParam(parsed.href, "k") || readParam(parsed.href, "key");
  if (!key) return undefined;

  const body = new URLSearchParams({
    key,
    type: "",
    redirect_url: parsed.href,
    openid: "",
    QX: "",
    domain: parsed.hostname,
    domain2: "",
    kuaizhan_site_id: "",
    group_id: "",
    sing: "",
    pv_sing: "",
    source: "",
    site_id: "11426",
    site: "",
    channel_id: "",
    uid: "",
    cms_request: "1",
    device_type: "web"
  });
  const response = await fetchWithTimeout(
    fetcher,
    "https://api.cmsv5.iyunzk.com/apis/SuperPage/get",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: `${parsed.protocol}//${parsed.hostname}/`,
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
      },
      body
    },
    SHORT_LINK_TIMEOUT_MS
  );
  if (!response.ok) return undefined;

  const payload = (await response.json().catch(() => null)) as unknown;
  return findTkl(payload);
}

function readParam(url: string, key: string): string {
  const match = url.match(new RegExp(`[?&#]${key}=([^&#]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function findTkl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTkl(item);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (record.field === "tkl" && typeof record.value === "string" && record.value.trim()) {
    return record.value.trim();
  }
  for (const child of Object.values(record)) {
    const found = findTkl(child);
    if (found) return found;
  }
  return undefined;
}

function isCommerceUrl(url: string): boolean {
  return COMMERCE_URL_RE.test(url);
}
