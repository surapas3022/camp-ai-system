import { createHmac, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { AccessLevel, UserRole } from "./contracts";

const SESSION_COOKIE = "secure_rag_staff_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const SESSION_VERSION = "v1";

export interface Session {
  role: UserRole;
  expiresAt: number;
}

export function isAuthorized(role: UserRole, accessLevel: AccessLevel): boolean {
  return accessLevel === "public" || role === "staff";
}

export async function verifyStaffPin(pin: string, env: Readonly<Record<string, string | undefined>> = process.env): Promise<boolean> {
  const encoded = requiredEnv("STAFF_PIN_SCRYPT_HASH", env);
  const parsed = parseScryptHash(encoded);
  const candidate = await deriveScrypt(pin, parsed);
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}

export function createStaffSession(now = new Date(), env: Readonly<Record<string, string | undefined>> = process.env): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(now.getTime() / 1_000) + SESSION_MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ role: "staff", exp: expiresAt })).toString("base64url");
  const signature = sign(payload, env);
  return { token: `${SESSION_VERSION}.${payload}.${signature}`, expiresAt };
}

export function resolveSession(request: Request, now = new Date(), env: Readonly<Record<string, string | undefined>> = process.env): Session {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return { role: "public", expiresAt: 0 };
  const [version, payload, signature, extra] = token.split(".");
  if (version !== SESSION_VERSION || !payload || !signature || extra) return { role: "public", expiresAt: 0 };
  let expected: string;
  try { expected = sign(payload, env); } catch { return { role: "public", expiresAt: 0 }; }
  if (!safeEqual(signature, expected)) return { role: "public", expiresAt: 0 };
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown; exp?: unknown };
    const expiresAt = decoded.exp;
    if (decoded.role !== "staff" || typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now.getTime() / 1_000)) return { role: "public", expiresAt: 0 };
    return { role: "staff", expiresAt };
  } catch { return { role: "public", expiresAt: 0 }; }
}

export function sessionCookie(token: string, expiresAt: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.max(0, expiresAt - Math.floor(Date.now() / 1_000))}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function sessionMaxAgeSeconds(): number { return SESSION_MAX_AGE_SECONDS; }

function sign(payload: string, env: Readonly<Record<string, string | undefined>>): string {
  return createHmac("sha256", requiredEnv("SESSION_SECRET", env)).update(`${SESSION_VERSION}.${payload}`).digest("base64url");
}

function requiredEnv(name: string, env: Readonly<Record<string, string | undefined>>): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in .env.local before enabling staff access.`);
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

function parseScryptHash(value: string): { cost: number; blockSize: number; parallelization: number; salt: Buffer; hash: Buffer } {
  const [algorithm, rawCost, rawBlockSize, rawParallelization, rawSalt, rawHash, extra] = value.split("$");
  const cost = Number(rawCost); const blockSize = Number(rawBlockSize); const parallelization = Number(rawParallelization);
  if (algorithm !== "scrypt" || extra || !Number.isSafeInteger(cost) || !Number.isSafeInteger(blockSize) || !Number.isSafeInteger(parallelization) || cost < 2 || blockSize < 1 || parallelization < 1 || !rawSalt || !rawHash) throw new Error("STAFF_PIN_SCRYPT_HASH must use scrypt$N$r$p$saltBase64url$hashBase64url format.");
  const salt = Buffer.from(rawSalt, "base64url"); const hash = Buffer.from(rawHash, "base64url");
  if (!salt.length || !hash.length) throw new Error("STAFF_PIN_SCRYPT_HASH has an invalid salt or hash.");
  return { cost, blockSize, parallelization, salt, hash };
}

function deriveScrypt(pin: string, parsed: ReturnType<typeof parseScryptHash>): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(pin, parsed.salt, parsed.hash.length, { N: parsed.cost, r: parsed.blockSize, p: parsed.parallelization }, (error, derived) => error ? reject(error) : resolve(Buffer.from(derived))));
}
