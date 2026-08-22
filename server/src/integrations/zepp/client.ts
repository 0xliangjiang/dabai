import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";

export type ZeppCaptcha = { key: string; imageBase64: string };
export type ZeppLogin = { userId: string; loginToken: string; appToken: string };
export type ZeppStepUpdate = { steps: number; date: string };

export interface ZeppClient {
  getRegistrationCaptcha(): Promise<ZeppCaptcha>;
  recognizeCaptcha(imageBase64: string): Promise<string>;
  registerAccount(input: {
    email: string;
    password: string;
    name: string;
    captchaKey: string;
    captchaCode: string;
  }): Promise<void>;
  login(email: string, password: string): Promise<ZeppLogin>;
  getBindTicket(userId: string): Promise<string>;
  checkBindStatus(userId: string): Promise<boolean>;
  updateSteps(input: { email: string; password: string; steps: number }): Promise<ZeppStepUpdate>;
}

export type ZeppClientOptions = {
  protocolAesKey?: string;
  protocolAesIv?: string;
  proxyApiUrl?: string;
  useProxy?: boolean;
  enableSpoofIp?: boolean;
  captchaOcrCommand?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  nanrunApiUrl?: string;
  nanrunApiKey?: string;
  nanrunTimeoutMs?: number;
  nanrunTlsCaBase64?: string;
};

export class ZeppClientError extends Error {
  constructor(message: string, readonly code = "ZEPP_REQUEST_FAILED") {
    super(message);
  }
}

export function createZeppClient(options: ZeppClientOptions = {}): ZeppClient {
  const injectedFetch = options.fetchImpl;
  const directFetch = injectedFetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const protocolKey = options.protocolAesKey ?? "xeNtBVqzDc6tuNTh";
  const protocolIv = options.protocolAesIv ?? "MAAAYAAAAAAAAABg";
  const useProxy = options.useProxy ?? true;
  const spoofIp = options.enableSpoofIp ?? true;
  const proxyApiUrl = options.proxyApiUrl?.trim() ?? "";
  const ocrCommand = options.captchaOcrCommand ?? "python3";
  const nanrunApiUrl = options.nanrunApiUrl?.trim() || "https://api.nan.run/api/xiaomisport";
  const nanrunApiKey = options.nanrunApiKey?.trim() ?? "";
  const nanrunTimeoutMs = options.nanrunTimeoutMs ?? 120_000;
  const nanrunTlsCa = options.nanrunTlsCaBase64?.trim()
    ? Buffer.from(options.nanrunTlsCaBase64.trim(), "base64").toString("utf8")
    : "";
  const nanrunDispatcher = nanrunTlsCa ? new Agent({ connect: { ca: nanrunTlsCa } }) : undefined;

  async function fetchProxy(): Promise<string> {
    if (!useProxy || !proxyApiUrl || injectedFetch) return "";
    try {
      const response = await directFetch(proxyApiUrl, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return "";
      return parseProxyResponse((await response.text()).trim());
    } catch {
      // 与 AI-Step 一致：代理服务不可用时关闭本次代理，回退直连完成流程。
      return "";
    }
  }

  async function request(url: string, init: RequestInit = {}, maxRetries = 4): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const headers = new Headers(init.headers);
        if (spoofIp) addSpoofHeaders(headers);
        const proxy = await fetchProxy();
        const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
        const response = proxy
          ? await undiciFetch(url, {
              ...(init as Parameters<typeof undiciFetch>[1]),
              headers: Object.fromEntries(headers.entries()),
              signal,
              dispatcher: new ProxyAgent(proxy)
            })
          : await directFetch(url, { ...init, headers, signal });
        if (response.status !== 429 || attempt === maxRetries - 1) return response as Response;
        await delay(Math.min(8_000, 2 ** attempt * 1_000) + Math.floor(Math.random() * 800 + 100));
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries - 1) break;
        await delay(Math.min(2_000, 300 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new ZeppClientError("Zepp 请求重试失败");
  }

  return {
    async getRegistrationCaptcha() {
      const suffix = `${randomLetters(2)}${randomDigits(2)}`;
      const response = await request(`https://api-user.huami.com/captcha/register?random=${suffix}`);
      if (!response.ok) throw new ZeppClientError(`获取 Zepp 验证码失败（${response.status}）`);
      const captchaKey = response.headers.get("captcha-key") ?? parseCaptchaCookie(response.headers.get("set-cookie"));
      if (!captchaKey) throw new ZeppClientError("Zepp 验证码响应缺少 captcha-key");
      return { key: captchaKey, imageBase64: Buffer.from(await response.arrayBuffer()).toString("base64") };
    },

    async recognizeCaptcha(imageBase64) {
      return runCaptchaOcr(imageBase64, ocrCommand, timeoutMs);
    },

    async registerAccount(input) {
      const registrationUrl = `https://api-user.huami.com/registrations/${encodeURIComponent(input.email)}`;
      const firstBody = new URLSearchParams({
        app_name: "com.huami.webapp", country_code: "CN", countryState: "",
        password: input.password, name: input.name, code: input.captchaCode, key: input.captchaKey,
        client_id: "HuaMi", redirect_uri: "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html",
        state: "REDIRECTION", token: "access", json_response: "true"
      });
      const headers = { app_name: "com.huami.webapp", "content-type": "application/x-www-form-urlencoded; charset=UTF-8" };
      const first = await request(registrationUrl, { method: "POST", headers, body: firstBody }, 5);
      const firstText = await first.text();
      if (!first.ok) throw new ZeppClientError("验证码错误或 Zepp 注册失败", "ZEPP_CAPTCHA_OR_REGISTER_FAILED");
      const firstJson = parseJson(firstText);
      const redirectUrl = typeof firstJson.data === "string" ? firstJson.data : "";
      const accessCode = redirectUrl ? new URL(redirectUrl).searchParams.get("access") : null;
      if (!accessCode) throw new ZeppClientError("Zepp 注册响应缺少 access token");

      const second = await request("https://account.huami.com/v1/client/register", {
        method: "POST", headers,
        body: new URLSearchParams({
          app_name: "com.huami.webapp", app_version: "4.3.0", code: accessCode,
          countryState: "", country_code: "CN", device_id: "02:00:00:00:00:00",
          device_model: "web", grant_type: "access_token", third_name: "huami"
        })
      }, 3);
      const secondJson = parseJson(await second.text());
      if (!second.ok || secondJson.result !== "ok" || !secondJson.token_info) throw new ZeppClientError("Zepp 账号创建失败");
    },

    async login(email, password) {
      const deviceId = randomUUID();
      const loginParams = new URLSearchParams({
        emailOrPhone: email, password, state: "REDIRECTION", client_id: "HuaMi",
        country_code: "CN", token: "access",
        redirect_uri: "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html"
      });
      const encrypted = encryptLoginPayload(Buffer.from(loginParams.toString()), protocolKey, protocolIv);
      const first = await request("https://api-user.zepp.com/v2/registrations/tokens", {
        method: "POST", redirect: "manual",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "user-agent": "MiFit6.14.0 (M2007J1SC; Android 12; Density/2.75)",
          app_name: "com.xiaomi.hm.health", appname: "com.xiaomi.hm.health", appplatform: "android_phone",
          "x-hm-ekv": "1", "hm-privacy-ceip": "false"
        },
        body: encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength) as ArrayBuffer
      });
      const accessCode = extractAccessCode(first.headers.get("location"));
      if (first.status !== 303 || !accessCode) throw new ZeppClientError("Zepp 登录第一步失败");

      const second = await request("https://account.huami.com/v2/client/login", {
        method: "POST",
        headers: {
          app_name: "com.xiaomi.hm.health", appname: "com.xiaomi.hm.health", appplatform: "android_phone",
          "accept-language": "zh-CN", "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-request-id": randomUUID(), cv: "50818_6.14.0", v: "2.0"
        },
        body: new URLSearchParams({
          "allow_registration=": "false", app_name: "com.xiaomi.hm.health", app_version: "6.14.0",
          code: accessCode, country_code: "CN", device_id: deviceId, device_model: "android_phone",
          dn: "account.zepp.com,api-user.zepp.com,api-mifit.zepp.com,api-watch.zepp.com",
          grant_type: "access_token", lang: "zh_CN", os_version: "1.5.0",
          source: "com.xiaomi.hm.health:6.14.0:50818", third_name: "email"
        })
      });
      const data = parseJson(await second.text());
      const tokenInfo = data.token_info as Record<string, unknown> | undefined;
      const userId = stringValue(tokenInfo?.user_id);
      const loginToken = stringValue(tokenInfo?.login_token);
      let appToken = stringValue(tokenInfo?.app_token);
      if (!second.ok || !userId || !loginToken) throw new ZeppClientError("Zepp 登录失败");
      if (!appToken) {
        const tokenResponse = await request(
          `https://account-cn.huami.com/v1/client/app_tokens?${new URLSearchParams({
            app_name: "com.xiaomi.hm.health", dn: "api-user.huami.com,api-mifit.huami.com,app-analytics.huami.com",
            login_token: loginToken
          })}`,
          { headers: { "user-agent": "MiFit/5.3.0 (iPhone; iOS 14.7.1; Scale/3.00)" } }
        );
        const tokenData = parseJson(await tokenResponse.text());
        appToken = stringValue((tokenData.token_info as Record<string, unknown> | undefined)?.app_token);
      }
      if (!appToken) throw new ZeppClientError("Zepp 登录 token 不完整");
      return { userId, loginToken, appToken };
    },

    async getBindTicket(userId) {
      const response = await request(`https://weixin.amazfit.com/v1/bind/qrcode.json?${new URLSearchParams({ wxname: "md", brandName: "amazfit", userid: userId })}`);
      const data = parseJson(await response.text());
      const ticket = stringValue((data.data as Record<string, unknown> | undefined)?.ticket);
      if (!response.ok || data.code !== 1 || !ticket) throw new ZeppClientError("获取微信绑定二维码失败");
      return ticket;
    },

    async checkBindStatus(userId) {
      const response = await request(`https://weixin.amazfit.com/v1/info/users.json?${new URLSearchParams({ wxname: "md", userid: userId })}`);
      const data = parseJson(await response.text());
      if (!response.ok || data.code !== 1 || typeof data.data !== "object" || data.data === null) throw new ZeppClientError("检查微信绑定状态失败");
      return Number((data.data as Record<string, unknown>).isbind) === 1;
    },

    async updateSteps(input) {
      if (!Number.isInteger(input.steps) || input.steps < 1 || input.steps > 98_800) {
        throw new ZeppClientError("步数范围应为 1-98800", "ZEPP_INVALID_STEPS");
      }
      if (!nanrunApiKey) {
        throw new ZeppClientError("运动目标服务尚未配置 NANRUN_API_KEY", "NANRUN_NOT_CONFIGURED");
      }

      let lastMessage = "第三方接口请求失败";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const url = new URL(nanrunApiUrl);
          url.searchParams.set("apikey", nanrunApiKey);
          url.searchParams.set("user", input.email);
          url.searchParams.set("pass", input.password);
          url.searchParams.set("step", String(input.steps));
          const response = nanrunDispatcher && !injectedFetch
            ? await undiciFetch(url, {
                signal: AbortSignal.timeout(nanrunTimeoutMs),
                dispatcher: nanrunDispatcher
              }) as Response
            : await directFetch(url, { signal: AbortSignal.timeout(nanrunTimeoutMs) });
          const raw = await response.text();
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            lastMessage = `第三方接口返回非 JSON（HTTP ${response.status}）`;
          }
          const message = stringValue(data.msg ?? data.message);
          if (response.ok && String(data.code) === "200") {
            const returnedSteps = Number(data.step);
            return {
              steps: Number.isInteger(returnedSteps) && returnedSteps > 0 ? returnedSteps : input.steps,
              date: chinaDateString()
            };
          }
          lastMessage = response.status === 400
            ? `第三方接口参数错误${message ? `：${message}` : ""}`
            : message || `第三方接口 HTTP ${response.status}`;
        } catch (error) {
          lastMessage = error instanceof Error ? error.message : "第三方接口请求异常";
        }
        if (attempt < 2) await delay(1_000 * 2 ** attempt);
      }
      throw new ZeppClientError(`步数同步失败：${lastMessage}`, "NANRUN_STEP_UPDATE_FAILED");
    }
  };
}

function chinaDateString(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function runCaptchaOcr(imageBase64: string, command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL("./ocr.py", import.meta.url));
    const child = spawn(command, [script], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errorOutput = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { errorOutput += chunk; });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output.trim().toLowerCase());
      else reject(new ZeppClientError(`验证码 OCR 失败：${errorOutput.trim() || `exit ${code}`}`, "ZEPP_OCR_FAILED"));
    });
    child.stdin.end(imageBase64);
  });
}

function parseProxyResponse(text: string): string {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    if (json.err === true) throw new ZeppClientError("代理接口返回错误", "ZEPP_PROXY_FAILED");
    const data = Array.isArray(json.data) ? json.data[0] as Record<string, unknown> | undefined : undefined;
    if (data) {
      const address = stringValue(data.proxy ?? data.ipPort ?? data["ip:port"] ?? data.ip_port);
      const username = stringValue(data.username ?? data.user);
      const password = stringValue(data.password ?? data.pass);
      if (address) return buildProxyUrl(address, username, password);
    }
  } catch (error) {
    if (error instanceof ZeppClientError) throw error;
  }
  const parts = text.split(":");
  if (parts.length === 2) return `http://${text}`;
  if (parts.length >= 4) return buildProxyUrl(`${parts[0]}:${parts[1]}`, parts[2]!, parts.slice(3).join(":"));
  throw new ZeppClientError("代理接口响应格式无法识别", "ZEPP_PROXY_FAILED");
}

function buildProxyUrl(address: string, username = "", password = ""): string {
  return username && password ? `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${address}` : `http://${address}`;
}

function addSpoofHeaders(headers: Headers): void {
  const ip = randomPublicIpv4();
  for (const name of ["X-Forwarded-For", "X-Real-IP", "Client-IP", "CF-Connecting-IP", "True-Client-IP"]) headers.set(name, ip);
}

function randomPublicIpv4(): string {
  while (true) {
    const octets = [...randomBytes(4)];
    const [a, b] = octets;
    if (!a || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168)) continue;
    return octets.join(".");
  }
}

function encryptLoginPayload(plain: Buffer, keyText: string, ivText: string): Buffer {
  const key = Buffer.from(keyText, "utf8");
  const iv = Buffer.from(ivText, "utf8");
  if (key.length !== 16 || iv.length !== 16) throw new Error("Zepp 协议 AES key/iv 必须为 16 字节");
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

function parseJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new ZeppClientError("Zepp 返回了无法解析的响应"); }
}

function extractAccessCode(location: string | null): string {
  if (!location) return "";
  try { return new URL(location).searchParams.get("access") ?? ""; }
  catch { return ""; }
}

function parseCaptchaCookie(cookie: string | null): string {
  return cookie?.match(/(?:^|;\s*)captcha-key=([^;]+)/i)?.[1] ?? "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function randomLetters(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
