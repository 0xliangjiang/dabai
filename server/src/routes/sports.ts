import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import {
  MAX_SPORTS_STEPS,
  MIN_SPORTS_STEPS,
  recognizeSportsIntent
} from "../domain/sports-agent.js";
import { decryptCredential, encryptCredential } from "../integrations/zepp/credentials.js";
import type { ZeppClient } from "../integrations/zepp/client.js";
import { ZeppClientError } from "../integrations/zepp/client.js";
import type { Repositories, SportsAccountRecord } from "../repositories/types.js";

export type QrEncoder = (content: string) => Promise<string>;

const captchaSchema = z.object({
  code: z.string().trim().min(3).max(12).regex(/^[a-zA-Z0-9]+$/, "验证码格式不正确")
});

const sportsChatSchema = z.object({
  message: z.string().trim().min(1, "请输入内容").max(500, "消息不能超过 500 字"),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(500)
  })).max(12).default([])
});

export async function registerSportsRoutes(
  app: FastifyInstance,
  repositories: Repositories,
  config: AppConfig,
  zeppClient: ZeppClient,
  qrEncoder: QrEncoder = defaultQrEncoder
) {
  const requireSportsEnabled = async (reply: FastifyReply) => {
    if (await repositories.settings.getSportsEnabled()) return true;
    await reply.code(404).send({ error: "运动功能暂未开放" });
    return false;
  };

  app.get("/api/sports/account", async (request, reply) => {
    if (!(await requireSportsEnabled(reply))) return;
    return accountView(await repositories.sportsAccounts.findByUser(request.userId));
  });

  app.post("/api/sports/chat", {
    config: { rateLimit: { max: 12, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    if (!(await requireSportsEnabled(reply))) return;
    const parsed = sportsChatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "消息格式不正确" });
    }

    const intent = recognizeSportsIntent(parsed.data.message, parsed.data.history);
    if (intent.type === "ask_steps") {
      return {
        success: true,
        action: "ask_steps",
        reply: `今天的运动目标是多少？请输入 ${MIN_SPORTS_STEPS}-${MAX_SPORTS_STEPS} 之间的目标值。`
      };
    }
    if (intent.type === "chat") {
      return { success: true, action: "reply", reply: intent.reply };
    }
    if (intent.steps < MIN_SPORTS_STEPS || intent.steps > MAX_SPORTS_STEPS) {
      return {
        success: false,
        action: "invalid_steps",
        reply: `今天的运动目标需要在 ${MIN_SPORTS_STEPS}-${MAX_SPORTS_STEPS} 步之间，请重新输入。`
      };
    }

    const readinessError = validateStepApiConfig(config);
    if (readinessError) return reply.code(503).send({ error: readinessError });
    let account = await repositories.sportsAccounts.findByUser(request.userId);
    if (!account?.zeppUserId) {
      return { success: false, action: "bind_required", reply: "还没有运动账号，请先点击上方“绑定账号”完成注册和绑定。" };
    }

    try {
      if (account.bindStatus !== "bound") {
        const isBound = await zeppClient.checkBindStatus(account.zeppUserId);
        if (!isBound) {
          return { success: false, action: "bind_required", reply: "账号还没有绑定微信，请先完成扫码绑定，再设置今天的运动目标。" };
        }
        account = await repositories.sportsAccounts.update(request.userId, { status: "ready", bindStatus: "bound" });
      }
      if (!account.membershipExpiresAt || account.membershipExpiresAt.getTime() <= Date.now()) {
        return { success: false, action: "membership_expired", reply: "运动会员已到期，续费后即可继续设置今天的运动目标。" };
      }

      // 与 AI-Step 的 bindband 保持一致：第三方接口直接接收托管账号和目标步数。
      const password = decryptCredential(account.passwordCipher, config.zeppCredentialKey!);
      const result = await zeppClient.updateSteps({
        email: account.email,
        password,
        steps: intent.steps
      });
      return {
        success: true,
        action: "steps_updated",
        steps: result.steps,
        date: result.date,
        reply: `设置成功，今天的运动目标为 ${result.steps.toLocaleString("zh-CN")} 步。`
      };
    } catch (error) {
      request.log.warn({ err: error, userId: request.userId, steps: intent.steps }, "Zepp step update failed");
      return reply.code(502).send({ error: "运动目标设置失败，请稍后重试" });
    }
  });

  app.post("/api/sports/bind/start", {
    config: { rateLimit: { max: 5, timeWindow: "10 minutes" } }
  }, async (request, reply) => {
    if (!(await requireSportsEnabled(reply))) return;
    const readinessError = validateFeatureConfig(config);
    if (readinessError) return reply.code(503).send({ error: readinessError });

    try {
      const existing = await repositories.sportsAccounts.findByUser(request.userId);
      if (existing?.bindStatus === "bound") return accountView(existing);
      if (existing?.zeppUserId) return await qrView(existing, zeppClient, qrEncoder);

      const password = existing
        ? decryptCredential(existing.passwordCipher, config.zeppCredentialKey!)
        : generatePassword();
      let account = existing;
      let lastError = "";
      const retryTimes = Math.max(1, Math.min(10, config.zeppCaptchaRetryTimes ?? 5));

      // 完整沿用 AI-Step：验证码先走 OCR，识别或注册失败就更换代理和验证码重试。
      for (let attempt = 0; attempt < retryTimes; attempt += 1) {
        const captcha = await zeppClient.getRegistrationCaptcha();
        const captchaExpiresAt = new Date(Date.now() + 5 * 60_000);
        if (!account) {
          try {
            account = await repositories.sportsAccounts.create({
              userId: request.userId,
              email: generateRandomEmail(),
              passwordCipher: encryptCredential(password, config.zeppCredentialKey!),
              captchaKey: captcha.key,
              captchaExpiresAt,
              membershipExpiresAt: trialExpiry(config.sportsTrialDays)
            });
          } catch (error) {
            account = await repositories.sportsAccounts.findByUser(request.userId);
            if (!account) throw error;
          }
        }
        account = await repositories.sportsAccounts.update(request.userId, {
          status: "registering",
          captchaKey: captcha.key,
          captchaExpiresAt
        });

        try {
          const code = await zeppClient.recognizeCaptcha(captcha.imageBase64);
          if (!code) {
            lastError = "OCR 未识别出验证码";
            continue;
          }
          await zeppClient.registerAccount({
            email: account.email,
            password,
            name: account.email,
            captchaKey: captcha.key,
            captchaCode: code
          });
          return await finishRegistration(account, password, config.zeppCredentialKey!, repositories, zeppClient, qrEncoder);
        } catch (error) {
          lastError = error instanceof Error ? error.message : "自动识别注册失败";
        }
      }

      // 与原项目一致：自动 OCR 全部失败后，才返回一张新验证码供人工输入。
      const captcha = await zeppClient.getRegistrationCaptcha();
      account = await repositories.sportsAccounts.update(request.userId, {
        status: "awaiting_captcha",
        captchaKey: captcha.key,
        captchaExpiresAt: new Date(Date.now() + 5 * 60_000)
      });
      return {
        ...accountView(account),
        action: "captcha",
        captchaImage: `data:image/png;base64,${captcha.imageBase64}`,
        message: `自动识别未通过，请输入图片验证码${lastError ? `（${lastError}）` : ""}`
      };
    } catch (error) {
      request.log.warn({ err: error, userId: request.userId }, "start Zepp binding failed");
      return reply.code(error instanceof ZeppClientError ? 502 : 500).send({
        error: publicError(error, "暂时无法开始绑定，请稍后重试")
      });
    }
  });

  app.post("/api/sports/bind/captcha", {
    config: { rateLimit: { max: 8, timeWindow: "10 minutes" } }
  }, async (request, reply) => {
    if (!(await requireSportsEnabled(reply))) return;
    const readinessError = validateFeatureConfig(config);
    if (readinessError) return reply.code(503).send({ error: readinessError });
    const parsed = captchaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "验证码格式不正确" });
    }

    const account = await repositories.sportsAccounts.findByUser(request.userId);
    if (!account?.captchaKey || !account.captchaExpiresAt) {
      return reply.code(409).send({ error: "验证码已失效，请重新点击绑定账号" });
    }
    if (account.captchaExpiresAt.getTime() <= Date.now()) {
      return reply.code(409).send({ error: "验证码已过期，请重新获取" });
    }
    if (!(await repositories.sportsAccounts.claimCaptcha(request.userId, new Date()))) {
      return reply.code(409).send({ error: "账号正在创建，请勿重复提交" });
    }

    try {
      const password = decryptCredential(account.passwordCipher, config.zeppCredentialKey!);
      await zeppClient.registerAccount({
        email: account.email,
        password,
        name: `运动用户${request.userId.slice(-6)}`,
        captchaKey: account.captchaKey,
        captchaCode: parsed.data.code
      });
      return await finishRegistration(account, password, config.zeppCredentialKey!, repositories, zeppClient, qrEncoder);
    } catch (error) {
      await repositories.sportsAccounts.update(request.userId, {
        status: "registration_failed",
        captchaKey: null,
        captchaExpiresAt: null
      });
      request.log.warn({ err: error, userId: request.userId }, "complete Zepp registration failed");
      const captchaFailed = error instanceof ZeppClientError && error.code === "ZEPP_CAPTCHA_OR_REGISTER_FAILED";
      return reply.code(captchaFailed ? 400 : 502).send({
        error: captchaFailed
          ? "验证码不正确，请关闭弹窗后重新点击绑定账号"
          : publicError(error, "Zepp 账号创建失败，请稍后重试")
      });
    }
  });

  app.post("/api/sports/bind/refresh", {
    config: { rateLimit: { max: 12, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    if (!(await requireSportsEnabled(reply))) return;
    const account = await repositories.sportsAccounts.findByUser(request.userId);
    if (!account?.zeppUserId) return reply.code(409).send({ error: "请先创建 Zepp Life 账号并扫码" });
    try {
      const isBound = await zeppClient.checkBindStatus(account.zeppUserId);
      const updated = isBound
        ? await repositories.sportsAccounts.update(request.userId, { status: "ready", bindStatus: "bound" })
        : account;
      if (isBound) return { ...accountView(updated), message: "微信绑定成功" };
      return { ...(await qrView(updated, zeppClient, qrEncoder)), message: "暂未检测到绑定，请扫码后再次检查" };
    } catch (error) {
      request.log.warn({ err: error, userId: request.userId }, "refresh Zepp binding failed");
      return reply.code(502).send({ error: publicError(error, "检查绑定状态失败，请稍后重试") });
    }
  });
}

async function qrView(account: SportsAccountRecord, client: ZeppClient, encoder: QrEncoder) {
  const ticket = await client.getBindTicket(account.zeppUserId!);
  return {
    ...accountView(account),
    action: "scan",
    qrcodeImage: await encoder(ticket),
    message: "请使用微信扫描二维码完成绑定"
  };
}

async function finishRegistration(
  account: SportsAccountRecord,
  password: string,
  credentialKey: string,
  repositories: Repositories,
  client: ZeppClient,
  encoder: QrEncoder
) {
  const login = await client.login(account.email, password);
  const registered = await repositories.sportsAccounts.update(account.userId, {
    zeppUserId: login.userId,
    loginTokenCipher: encryptCredential(login.loginToken, credentialKey),
    appTokenCipher: encryptCredential(login.appToken, credentialKey),
    status: "registered",
    bindStatus: "unbound",
    captchaKey: null,
    captchaExpiresAt: null
  });
  return qrView(registered, client, encoder);
}

function accountView(account?: SportsAccountRecord) {
  if (!account) return { isBound: false, status: "unbound", account: null, membershipExpiresAt: null };
  return {
    isBound: account.bindStatus === "bound",
    status: account.status,
    account: { platform: "Zepp Life", email: maskEmail(account.email) },
    membershipExpiresAt: account.membershipExpiresAt?.toISOString() ?? null
  };
}

function validateFeatureConfig(config: AppConfig): string | null {
  if (!config.zeppCredentialKey || config.zeppCredentialKey.length < 24) {
    return "运动账号功能尚未配置安全的 ZEPP_CREDENTIAL_KEY";
  }
  return null;
}

function validateStepApiConfig(config: AppConfig): string | null {
  const featureError = validateFeatureConfig(config);
  if (featureError) return featureError;
  if (!config.nanrunApiKey?.trim()) {
    return "运动目标服务尚未配置 NANRUN_API_KEY";
  }
  return null;
}

function generateRandomEmail(): string {
  return `${randomString("abcdefghijklmnopqrstuvwxyz0123456789", 10)}@gmail.com`;
}

function generatePassword(): string {
  return randomString("abcdefghijklmnopqrstuvwxyz", 12);
}

function randomString(alphabet: string, length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte! % alphabet.length]).join("");
}

function trialExpiry(days = 3): Date | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60_000);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return local && domain ? `${local.slice(0, 4)}***@${domain}` : "Zepp Life 账号";
}

function publicError(error: unknown, fallback: string): string {
  return error instanceof ZeppClientError ? error.message : fallback;
}

async function defaultQrEncoder(content: string): Promise<string> {
  return QRCode.toDataURL(content, { width: 360, margin: 2, errorCorrectionLevel: "M" });
}
