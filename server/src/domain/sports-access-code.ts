import { createHash, randomBytes } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeSportsAccessCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashSportsAccessCode(value: string): string {
  return createHash("sha256").update(normalizeSportsAccessCode(value)).digest("hex");
}

export function generateSportsAccessCode(): string {
  const bytes = randomBytes(15);
  let body = "";
  for (let index = 0; index < 15; index += 1) body += CODE_ALPHABET[bytes[index]! % CODE_ALPHABET.length];
  return `STEP-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}`;
}

export function sportsAccessCodeHint(value: string): string {
  const normalized = normalizeSportsAccessCode(value);
  return `${normalized.slice(0, 9)}-****-${normalized.slice(-4)}`;
}
