import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
export const DEFAULT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

type TokenPayload = {
  sub: string;
  exp: number;
};

export function signUserToken(
  userId: string,
  secret: string,
  ttlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS
): string {
  const payload: TokenPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${TOKEN_VERSION}.${encoded}.${sign(encoded, secret)}`;
}

export function verifyUserToken(token: string, secret: string): string | null {
  const [version, encoded, signature] = token.split(".");
  if (version !== TOKEN_VERSION || !encoded || !signature) {
    return null;
  }

  const expected = sign(encoded, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }

  if (typeof payload.sub !== "string" || payload.sub === "") {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload.sub;
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${TOKEN_VERSION}.${encodedPayload}`).digest("base64url");
}
