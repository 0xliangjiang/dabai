import { createHash, randomBytes } from "node:crypto";
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
import { hashSportsAccessCode, normalizeSportsAccessCode } from "../domain/sports-access-code.js";
import type { Repositories, SportsAccountRecord } from "../repositories/types.js";

export type QrEncoder = (content: string) => Promise<string>;

const captchaSchema = z.object({
  code: z.string().trim().min(3).max(12).regex(/^[a-zA-Z0-9]+$/, "验证码格式不正确")
});

const sportsChatSchema = z.object({
  message: z.string().trim().min(1, "请输入内容").max(500, "消息不能超过 500 字"),
  accessGrantToken: z.string().trim().min(32).max(128).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(500)
  })).max(12).default([])
});

const accessCodeSchema = z.object({
  code: z.string().trim().min(12, "请输入完整卡密").max(64, "卡密格式不正确")
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
    const targetDate = sportsTargetDate();
    const [account, dailyTarget] = await Promise.all([
      repositories.sportsAccounts.findByUser(request.userId),
      repositories.sportsDailyTargets.findByUserAndDate(request.userId, targetDate)
    ]);
    return accountView(account, dailyTarget?.steps ?? null);
  });

  app.post("/api/sports/access-code/redeem", async (request, reply) => {
    if (!(await requireSportsEnabled(reply))) return;
    const parsed = accessCodeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "卡密格式不正确" });
    const result = await repositories.sportsAccessCodes.redeem(
      request.userId,
      hashSportsAccessCode(parsed.data.code),
      new Date()
    );
    if (!result.ok) {
      const response = {
        invalid: [404, "卡密无效，请核对后重试"],
        expired: [410, "卡密已过兑换期限"],
        used: [409, "卡密已使用或已撤销"],
        no_account: [409, "请先创建 Zepp Life 账号，再兑换卡密"]
      }[result.reason] as [number, string];
      return reply.code(response[0]).send({ error: response[1] });
    }
    return {
      success: true,
      durationDays: result.durationDays,
      membershipExpiresAt: result.membershipExpiresAt,
      message: `兑换成功，运动会员已增加 ${result.durationDays} 天。`
    };
  });

  app.post("/api/sports/ad/reward", {
    config: { rateLimit: { max: 30, timeWindow: "1 day" } }
  }, async (request, reply) => {
    if (!(await requireSportsEnabled(reply))) return;
    if (!config.sportsRewardedVideoAdUnitId?.trim()) {
      return reply.code(503).send({ error: "激励广告暂未配置，请使用卡密或邀请好友" });
    }
    const account = await repositories.sportsAccounts.findByUser(request.userId);
    if (!account || account.bindStatus !== "bound") {
      return reply.code(409).send({ error: "请先绑定 Zepp Life 账号" });
    }
    if (account.membershipExpiresAt && account.membershipExpiresAt.getTime() > Date.now()) {
      return reply.code(409).send({ error: "会员仍在有效期内，无需观看广告" });
    }
    const now = new Date();
    const grantToken = randomBytes(24).toString("hex");
    await repositories.sportsAdGrants.create(
      request.userId,
      hashAdGrantToken(grantToken),
      now,
      new Date(now.getTime() + 15 * 60_000)
    );
    return {
      success: true,
      grantToken,
      expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      message: "已解锁 1 次运动目标设置，请在 15 分钟内使用。"
    };
  });

  app.post("/api/sports/chat", {
    config: { rateLimit: { max: 12, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    if (!(await requireSportsEnabled(reply))) return;
    const parsed = sportsChatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "消息格式不正确" });
    }

    const possibleAccessCode = normalizeSportsAccessCode(parsed.data.message);
    if (/^STEP[A-Z0-9]{15}$/.test(possibleAccessCode)) {
      const redeemed = await repositories.sportsAccessCodes.redeem(
        request.userId,
        hashSportsAccessCode(possibleAccessCode),
        new Date()
      );
      if (redeemed.ok) {
        return {
          success: true,
          action: "access_code_redeemed",
          membershipExpiresAt: redeemed.membershipExpiresAt,
          reply: `卡密兑换成功，运动会员已增加 ${redeemed.durationDays} 天。`
        };
      }
      const message = {
        invalid: "这张卡密无效，请核对后重新输入。",
        expired: "这张卡密已过兑换期限。",
        used: "这张卡密已使用或已撤销。",
        no_account: "请先点击上方“绑定账号”创建 Zepp Life 账号，再输入卡密。"
      }[redeemed.reason];
      return { success: false, action: "access_code_invalid", reply: message };
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

    let reservedGrantHash = "";
    try {
      if (account.bindStatus !== "bound") {
        const isBound = await zeppClient.checkBindStatus(account.zeppUserId);
        if (!isBound) {
          return { success: false, action: "bind_required", reply: "账号还没有绑定微信，请先完成扫码绑定，再设置今天的运动目标。" };
        }
        account = await repositories.sportsAccounts.update(request.userId, { status: "ready", bindStatus: "bound" });
      }
      const membershipExpired = !account.membershipExpiresAt || account.membershipExpiresAt.getTime() <= Date.now();
      if (membershipExpired) {
        if (!parsed.data.accessGrantToken) {
          return {
            success: false,
            action: "membership_expired",
            reply: "运动会员已到期。你可以看广告解锁 1 次、输入卡密延期，或邀请新用户增加 3 天。"
          };
        }
        reservedGrantHash = hashAdGrantToken(parsed.data.accessGrantToken);
        const reserved = await repositories.sportsAdGrants.reserve(
          request.userId,
          reservedGrantHash,
          new Date()
        );
        if (!reserved) {
          return {
            success: false,
            action: "ad_grant_invalid",
            reply: "本次广告解锁已失效或已使用，请重新观看广告。"
          };
        }
      }

      // 与 AI-Step 的 bindband 保持一致：第三方接口直接接收托管账号和目标步数。
      const password = decryptCredential(account.passwordCipher, config.zeppCredentialKey!);
      const result = await zeppClient.updateSteps({
        email: account.email,
        password,
        steps: intent.steps
      });
      await repositories.sportsDailyTargets.upsert(
        request.userId,
        sportsTargetDate(),
        result.steps
      );
      if (reservedGrantHash) {
        await repositories.sportsAdGrants.complete(request.userId, reservedGrantHash, new Date());
      }
      return {
        success: true,
        action: "steps_updated",
        steps: result.steps,
        date: result.date,
        reply: `设置成功，今天的运动目标为 ${result.steps.toLocaleString("zh-CN")} 步。`
      };
    } catch (error) {
      if (reservedGrantHash) {
        await repositories.sportsAdGrants.release(request.userId, reservedGrantHash);
      }
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
          await repositories.users.applyPendingSportsInviteRewards(
            request.userId,
            positiveDays(config.sportsInviteRewardDays, 3),
            new Date()
          );
          account = await repositories.sportsAccounts.findByUser(request.userId) ?? account;
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

function accountView(account?: SportsAccountRecord, todayTargetSteps: number | null = null) {
  if (!account) {
    return {
      isBound: false,
      status: "unbound",
      account: null,
      membershipExpiresAt: null,
      todayTargetSteps: null,
      lastTargetSteps: null
    };
  }
  return {
    isBound: account.bindStatus === "bound",
    status: account.status,
    account: { platform: "Zepp Life", email: maskEmail(account.email) },
    membershipExpiresAt: account.membershipExpiresAt?.toISOString() ?? null,
    todayTargetSteps,
    // 兼容尚未更新的小程序版本；该字段现在同样只表示当天目标。
    lastTargetSteps: todayTargetSteps
  };
}

export function sportsTargetDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
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

function hashAdGrantToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function positiveDays(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
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
