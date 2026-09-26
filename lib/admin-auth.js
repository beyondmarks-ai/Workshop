import crypto from "node:crypto";
import { cookies } from "next/headers";

export const adminEmail = "admin@beyondmarks.ai";
const adminCookie = "astra_admin_access";

function signature(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
}

export function validAdminCredentials(email, pin) {
  const expectedPin = process.env.ADMIN_PIN;
  if (!expectedPin || String(email || "").trim().toLowerCase() !== adminEmail || String(pin || "").length !== expectedPin.length) return false;
  return crypto.timingSafeEqual(Buffer.from(String(pin)), Buffer.from(expectedPin));
}

export function setAdminAccess() {
  const payload = Buffer.from(JSON.stringify({ email: adminEmail, expires: Date.now() + 60 * 60 * 1000 })).toString("base64url");
  cookies().set(adminCookie, `${payload}.${signature(payload)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
}

export function hasAdminAccess() {
  try {
    const [payload, supplied] = cookies().get(adminCookie)?.value.split(".") || [];
    if (!payload || !supplied) return false;
    const expected = signature(payload);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.email === adminEmail && session.expires > Date.now();
  } catch { return false; }
}
