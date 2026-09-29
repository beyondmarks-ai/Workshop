import crypto from "node:crypto";
import { cookies } from "next/headers";

export const adminEmail = "admin@beyondmarks.ai";
const adminCookie = "astra_admin_access";
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function signature(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
}

function validAccessToken(token) {
  try {
    const [payload, supplied] = String(token || "").split(".");
    if (!payload || !supplied) return false;
    const expected = signature(payload);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.email === adminEmail && session.expires > Date.now();
  } catch { return false; }
}

function base32Decode(value) {
  let bits = "";
  for (const character of String(value || "").toUpperCase().replace(/\s/g, "").replace(/=+$/, "")) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) return null;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function authenticatorCode(secret, counter) {
  const key = base32Decode(secret);
  if (!key?.length) return "";
  const data = Buffer.alloc(8);
  data.writeBigUInt64BE(BigInt(counter));
  const hash = crypto.createHmac("sha1", key).update(data).digest();
  const offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

export function adminTotpConfigured() {
  return Boolean(process.env.ADMIN_TOTP_SECRET);
}

function validAuthenticatorCode(code) {
  const supplied = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(supplied)) return false;
  const counter = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((offset) => {
    const expected = authenticatorCode(process.env.ADMIN_TOTP_SECRET, counter + offset);
    return expected && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  });
}

export function validAdminCredentials(email, pin, code) {
  const expectedPin = process.env.ADMIN_PIN;
  if (!adminTotpConfigured() || !expectedPin || String(email || "").trim().toLowerCase() !== adminEmail || String(pin || "").length !== expectedPin.length) return false;
  return crypto.timingSafeEqual(Buffer.from(String(pin)), Buffer.from(expectedPin)) && validAuthenticatorCode(code);
}

export function validAdminAppCredentials(email, pin) {
  const expectedPin = process.env.ADMIN_PIN;
  if (!expectedPin || String(email || "").trim().toLowerCase() !== adminEmail || String(pin || "").length !== expectedPin.length) return false;
  return crypto.timingSafeEqual(Buffer.from(String(pin)), Buffer.from(expectedPin));
}

export function setAdminAccess(maxAgeSeconds = 3600) {
  const payload = Buffer.from(JSON.stringify({ email: adminEmail, expires: Date.now() + maxAgeSeconds * 1000 })).toString("base64url");
  const token = `${payload}.${signature(payload)}`;
  cookies().set(adminCookie, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: maxAgeSeconds });
  return token;
}

export function clearAdminAccess() {
  cookies().set(adminCookie, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export function hasAdminAccess(request) {
  const authorization = request?.headers?.get?.("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return validAccessToken(bearer) || validAccessToken(cookies().get(adminCookie)?.value);
}
