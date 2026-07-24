import type { AppConfig } from "../../config/env.js";
import { fetchWithTimeout } from "../http.js";

type ConfigProvider = () => Promise<AppConfig>;

type CachedCode = {
  bytes: Buffer;
  contentType: "image/png" | "image/jpeg";
  expiresAt: number;
};

export type InviteCodeImage = {
  bytes: Buffer;
  contentType: "image/png" | "image/jpeg";
};

export type InviteCodeGenerator = {
  generate(userId: string): Promise<InviteCodeImage>;
};

export class WechatMiniCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WechatMiniCodeError";
  }
}

export function createInviteCodeGenerator(
  getConfig: ConfigProvider,
  fetcher: typeof fetch = fetch
): InviteCodeGenerator {
  let cachedToken = "";
  let tokenExpiresAt = 0;
  let tokenConfigKey = "";
  const codeCache = new Map<string, CachedCode>();

  async function getAccessToken(config: AppConfig): Promise<string> {
    const configKey = `${config.wechatAppId}:${config.wechatAppSecret}`;
    if (cachedToken && tokenConfigKey === configKey && Date.now() < tokenExpiresAt) {
      return cachedToken;
    }
    if (!isRealConfigValue(config.wechatAppId) || !isRealConfigValue(config.wechatAppSecret)) {
      throw new WechatMiniCodeError("小程序码服务尚未配置");
    }

    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", config.wechatAppId);
    url.searchParams.set("secret", config.wechatAppSecret);
    const response = await fetchWithTimeout(fetcher, url, {}, 10000);
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      errcode?: number;
      errmsg?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new WechatMiniCodeError(
        `获取微信 access_token 失败：${payload.errcode ?? response.status} ${payload.errmsg ?? ""}`.trim()
      );
    }

    cachedToken = payload.access_token;
    tokenConfigKey = configKey;
    tokenExpiresAt = Date.now() + Math.max(60, (payload.expires_in ?? 7200) - 300) * 1000;
    return cachedToken;
  }

  return {
    async generate(userId) {
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(userId)) {
        throw new WechatMiniCodeError("邀请参数格式不正确");
      }
      const cached = codeCache.get(userId);
      if (cached && Date.now() < cached.expiresAt) {
        return { bytes: cached.bytes, contentType: cached.contentType };
      }

      const config = await getConfig();
      const token = await getAccessToken(config);
      const response = await fetchWithTimeout(
        fetcher,
        `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scene: userId,
            page: "pages/invite/index",
            check_path: false,
            env_version: config.nodeEnv === "production" ? "release" : "develop",
            width: 430,
            auto_color: false,
            line_color: { r: 10, g: 122, b: 82 },
            is_hyaline: false
          })
        },
        15000
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || contentType.includes("application/json") || looksLikeJson(bytes)) {
        const payload = parseWechatError(bytes);
        throw new WechatMiniCodeError(
          `生成小程序码失败：${payload.errcode ?? response.status} ${payload.errmsg ?? ""}`.trim()
        );
      }
      const imageContentType = detectImageContentType(bytes);
      if (!imageContentType) {
        throw new WechatMiniCodeError("微信返回的小程序码格式不正确");
      }

      codeCache.set(userId, {
        bytes,
        contentType: imageContentType,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      });
      return { bytes, contentType: imageContentType };
    }
  };
}

function parseWechatError(bytes: Buffer): { errcode?: number; errmsg?: string } {
  try {
    return JSON.parse(bytes.toString("utf8")) as { errcode?: number; errmsg?: string };
  } catch (_error) {
    return {};
  }
}

function looksLikeJson(bytes: Buffer): boolean {
  const first = bytes.toString("utf8", 0, Math.min(bytes.length, 16)).trimStart()[0];
  return first === "{" || first === "[";
}

function detectImageContentType(bytes: Buffer): "image/png" | "image/jpeg" | undefined {
  const png =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (png) return "image/png";
  if (jpeg) return "image/jpeg";
  return undefined;
}

function isRealConfigValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith("replace-with-");
}
