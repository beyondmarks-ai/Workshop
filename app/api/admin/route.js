import crypto from "node:crypto";
import { cookies } from "next/headers";
import { deleteUser, getUser, listUsers, saveUser } from "../../../lib/storage";
import { adminTotpConfigured, clearAdminAccess, hasAdminAccess, setAdminAccess, validAdminCredentials } from "../../../lib/admin-auth";
import { saveActivity } from "../../../lib/activity";

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
  if (body.action === "logout-admin") {
    clearAdminAccess();
    return Response.json({ loggedOut: true });
  }
  if (!hasAdminAccess()) return Response.json({ error: "Admin verification required." }, { status: 401 });
  if (body.action === "polish-comment") {
    const comment = String(body.comment || "").trim().slice(0, 500);
    const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
    const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
    if (!comment) return Response.json({ error: "Enter a comment first." }, { status: 400 });
    if (!gateway || !apimKey) return Response.json({ error: "APIM gateway is not configured." }, { status: 503 });
    const response = await fetch(`${gateway}/openai/responses?api-version=2025-03-01-preview`, { method: "POST", headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": apimKey }, body: JSON.stringify({ model: "gpt-4.1", input: [{ role: "system", content: "Rewrite the admin's credit note professionally in one concise sentence. Preserve the meaning and do not add facts." }, { role: "user", content: comment }] }) });
    const result = await response.json().catch(() => ({}));
    const polished = result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text?.trim();
    if (!response.ok || !polished) return Response.json({ error: "GPT-4.1 could not polish the comment." }, { status: 502 });
    return Response.json({ comment: polished });
  }
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
    await saveActivity({ studentId: student.id, service: "admin-credit", action: delta > 0 ? "credit-added" : "credit-removed", status: "completed", creditsUsed: delta, balance: student.credits, note: String(body.note || "Admin credit adjustment").trim().slice(0, 500), source: "admin" });
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
