import { createHmac, timingSafeEqual } from "node:crypto";

type SportsSession = { userId: string; appId: string };
export function signSportsToken(userId: string, appId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, appId, aud: "sports", exp: Math.floor(Date.now()/1000) + 7*86400 })).toString("base64url");
  return `sports-v1.${payload}.${signature(payload, secret)}`;
}
export function verifySportsToken(token: string, secret: string): SportsSession | null {
  const [version, payload, sig, extra] = token.split(".");
  if (version !== "sports-v1" || !payload || !sig || extra) return null;
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (p.aud !== "sports" || typeof p.sub !== "string" || !p.sub || typeof p.appId !== "string" || !p.appId || typeof p.exp !== "number" || !Number.isFinite(p.exp) || p.exp <= Date.now()/1000) return null;
    return { userId: p.sub, appId: p.appId };
  } catch { return null; }
}
function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`sports-v1.${payload}`).digest("base64url");
}
