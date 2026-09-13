#!/usr/bin/env node
import { randomBytes, scryptSync } from "node:crypto";

const pin = process.argv[2];
if (!pin) {
  console.error("Usage: node scripts/generate_staff_session.mjs <staff-pin>");
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const hash = scryptSync(pin, salt, 32, { N, r, p });
const value = `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;

console.log(`SESSION_SECRET=${randomBytes(32).toString("base64url")}`);
console.log(`STAFF_PIN_SCRYPT_HASH=${value.replace(/\$/g, "\\$")}`);
