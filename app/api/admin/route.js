import crypto from "node:crypto";
import { cookies } from "next/headers";
import { deleteUser, getUser, listUsers, saveUser } from "../../../lib/storage";
import { adminTotpConfigured, hasAdminAccess, setAdminAccess, validAdminCredentials } from "../../../lib/admin-auth";

export const runtime = "nodejs";

async function currentUser() {
  try {
    const [payload, signature] = cookies().get("astra_session")?.value.split(".") || [];
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const id = session.expires > Date.now() ? session.id : null;
    return id && await getUser(id);
  } catch { return null; }
}

export async function GET() {
  if (!hasAdminAccess()) return Response.json({ error: "Admin verification required." }, { status: 401 });
  const users = await listUsers();
  return Response.json({
    users: users.map(({ passwordHash, passwordSalt, apiKeyHash, ...user }) => user),
    summary: { students: users.filter((user) => user.role === "student").length, pending: users.filter((user) => user.role === "student" && user.verified !== true).length, credits: users.reduce((total, user) => total + (user.role === "student" ? user.credits ?? 0 : 0), 0) }
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "verify-admin") {
    if (!adminTotpConfigured()) return Response.json({ error: "Google Authenticator is not configured on the server." }, { status: 503 });
    if (!validAdminCredentials(body.email, body.pin, body.code)) return Response.json({ error: "Invalid admin email, PIN, or authenticator code." }, { status: 403 });
    setAdminAccess();
    return Response.json({ verified: true });
  }
  if (!hasAdminAccess()) return Response.json({ error: "Admin verification required." }, { status: 401 });
  const actions = new Set(["verify-student", "adjust-credits", "revoke-student", "delete-student"]);
  if (!actions.has(body.action) || !/^[a-f0-9]{64}$/.test(String(body.studentId || ""))) return Response.json({ error: "Invalid student action." }, { status: 400 });
  const student = await getUser(body.studentId);
  if (!student || student.role !== "student") return Response.json({ error: "Student not found." }, { status: 404 });

  if (body.action === "delete-student") {
    await deleteUser(student.id);
    return Response.json({ deleted: true, studentId: student.id });
  }
  if (body.action === "adjust-credits") {
    const delta = Number(body.delta);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01 || Math.abs(delta) > Number.MAX_SAFE_INTEGER) return Response.json({ error: "Credit adjustment must be a positive number." }, { status: 400 });
    const currentCredits = Number.isFinite(Number(student.credits)) ? Number(student.credits) : 0;
    student.credits = Math.max(0, Math.round((currentCredits + delta) * 100) / 100);
  }
  if (body.action === "revoke-student") {
    student.verified = false;
    student.revokedAt = new Date().toISOString();
    student.codexAccessUntil = null;
  }
  if (body.action === "verify-student") {
    student.verified = true;
    student.verifiedAt = new Date().toISOString();
    if (!Number.isInteger(student.credits) || student.credits < 100) student.credits = 100;
  }
  student.updatedAt = new Date().toISOString();
  await saveUser(student);
  return Response.json({ verified: true, studentId: student.id });
}
