import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser, isVerifiedUser, saveUser } from "../../../lib/storage";

export const runtime = "nodejs";

async function sessionUser() {
  try {
    const [payload, signature] = cookies().get("astra_session")?.value.split(".") || [];
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.expires > Date.now() ? await getUser(session.id) : null;
  } catch { return null; }
}

export async function GET() {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const notifications = Array.isArray(user.notifications) ? user.notifications : [];
  return Response.json({ notifications, unread: notifications.filter((item) => !item.read).length });
}

export async function POST(request) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const notifications = Array.isArray(user.notifications) ? user.notifications : [];
  if (body.action !== "mark-read") return Response.json({ error: "Invalid notification action." }, { status: 400 });
  user.notifications = notifications.map((item) => body.id && item.id !== body.id ? item : { ...item, read: true });
  user.updatedAt = new Date().toISOString();
  await saveUser(user);
  return Response.json({ notifications: user.notifications });
}
