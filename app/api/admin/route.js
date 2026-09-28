import crypto from "node:crypto";
import { cookies } from "next/headers";
import { deleteUser, getUser, listUsers, saveUser } from "../../../lib/storage";
import { adminTotpConfigured, clearAdminAccess, hasAdminAccess, setAdminAccess, validAdminCredentials } from "../../../lib/admin-auth";
import { listStudentActivities, saveActivity } from "../../../lib/activity";
import { marketplaceItems } from "../../../lib/marketplace";

export const runtime = "nodejs";

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

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

export async function GET(request) {
  if (!hasAdminAccess(request)) return Response.json({ error: "Admin verification required." }, { status: 401 });
  const users = await listUsers();
  return Response.json({
    users: users.map(({ passwordHash, passwordSalt, apiKeyHash, apiKeyEncrypted, processedRefundIds, ...user }) => user),
    summary: { students: users.filter((user) => user.role === "student").length, pending: users.filter((user) => user.role === "student" && user.verified !== true).length, credits: users.reduce((total, user) => total + (user.role === "student" ? user.credits ?? 0 : 0), 0) }
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "verify-admin") {
    if (!adminTotpConfigured()) return Response.json({ error: "Google Authenticator is not configured on the server." }, { status: 503 });
    if (!validAdminCredentials(body.email, body.pin, body.code)) return Response.json({ error: "Invalid admin email, PIN, or authenticator code." }, { status: 403 });
    const token = setAdminAccess();
    return Response.json({ verified: true, token, expiresIn: 3600 });
  }
  if (body.action === "logout-admin") {
    clearAdminAccess();
    return Response.json({ loggedOut: true });
  }
  if (!hasAdminAccess(request)) return Response.json({ error: "Admin verification required." }, { status: 401 });
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
  if (body.action === "adjust-credits-bulk") {
    const studentIds = [...new Set(Array.isArray(body.studentIds) ? body.studentIds.map(String) : [])];
    const delta = Number(body.delta);
    if (!studentIds.length || studentIds.length > 100 || studentIds.some((id) => !/^[a-f0-9]{64}$/.test(id))) return Response.json({ error: "Select valid student accounts." }, { status: 400 });
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01 || Math.abs(delta) > Number.MAX_SAFE_INTEGER) return Response.json({ error: "Credit adjustment must be a positive number." }, { status: 400 });
    const updated = [];
    for (const studentId of studentIds) {
      const student = await getUser(studentId);
      if (!student || student.role !== "student") continue;
      const currentCredits = Number.isFinite(Number(student.credits)) ? Number(student.credits) : 0;
      student.credits = Math.max(0, Math.round((currentCredits + delta) * 100) / 100);
      student.updatedAt = new Date().toISOString();
      await saveUser(student);
      await saveActivity({ studentId: student.id, service: "admin-credit", action: delta > 0 ? "credit-added" : "credit-removed", status: "completed", creditsUsed: delta, balance: student.credits, note: String(body.note || "Admin credit adjustment").trim().slice(0, 500), source: "admin" });
      updated.push({ studentId: student.id, balance: student.credits });
    }
    return Response.json({ updated });
  }
  if (body.action === "send-notification") {
    const title = String(body.title || "").trim().slice(0, 100);
    const message = String(body.message || "").trim().slice(0, 1000);
    const allStudents = body.allStudents === true;
    const selectedIds = new Set(Array.isArray(body.studentIds) ? body.studentIds.map(String) : []);
    if (!title || !message || (!allStudents && !selectedIds.size)) return Response.json({ error: "Choose recipients and enter a title and message." }, { status: 400 });
    const users = await listUsers();
    const recipients = users.filter((user) => user.role === "student" && (allStudents || selectedIds.has(user.id)));
    for (const student of recipients) {
      const notifications = Array.isArray(student.notifications) ? student.notifications : [];
      student.notifications = [{ id: crypto.randomUUID(), title, message, createdAt: new Date().toISOString(), read: false }, ...notifications].slice(0, 50);
      student.updatedAt = new Date().toISOString();
      await saveUser(student);
    }
    return Response.json({ sent: recipients.length });
  }
  if (body.action === "student-usage") {
    if (!/^[a-f0-9]{64}$/.test(String(body.studentId || ""))) return Response.json({ error: "Invalid student." }, { status: 400 });
    const student = await getUser(body.studentId);
    if (!student || student.role !== "student") return Response.json({ error: "Student not found." }, { status: 404 });
    const purchases = Array.isArray(student.marketplacePurchases) ? student.marketplacePurchases : [];
    const catalog = new Map(marketplaceItems().map((item) => [item.id, item]));
    const usageByModel = {};
    for (const activity of await listStudentActivities(student.id)) {
      if (activity.service === "automatic-refund" || activity.action === "credit-refunded") continue;
      const rawModel = String(activity.request?.model || activity.action || "unknown");
      const model = catalog.has(rawModel) ? rawModel : ({ "claude-sonnet-5": "claude-sonnet", "claude-haiku-4-5": "claude-haiku", "claude-opus-5": "claude-opus" }[rawModel] || rawModel);
      const entry = usageByModel[model] || { requests: 0, credits: 0 };
      entry.requests += 1;
      const netCredits = activity.refundStatus === "refunded" ? 0 : Math.abs(Number(activity.creditsUsed) || 0);
      entry.credits = Math.round((entry.credits + netCredits) * 100) / 100;
      usageByModel[model] = entry;
    }
    const total = Object.values(usageByModel).reduce((result, entry) => ({ requests: result.requests + entry.requests, credits: Math.round((result.credits + entry.credits) * 100) / 100 }), { requests: 0, credits: 0 });
    return Response.json({ purchases, usageByModel, total });
  }
  if (body.action === "remove-marketplace-purchase") {
    if (!/^[a-f0-9]{64}$/.test(String(body.studentId || "")) || !String(body.itemId || "")) return Response.json({ error: "Invalid marketplace access request." }, { status: 400 });
    const student = await getUser(body.studentId);
    if (!student || student.role !== "student") return Response.json({ error: "Student not found." }, { status: 404 });
    const purchases = Array.isArray(student.marketplacePurchases) ? student.marketplacePurchases : [];
    const removed = purchases.find((purchase) => purchase.itemId === body.itemId);
    if (!removed) return Response.json({ error: "That model is not purchased by this student." }, { status: 404 });
    student.marketplacePurchases = purchases.filter((purchase) => purchase.itemId !== body.itemId);
    student.updatedAt = new Date().toISOString();
    await saveUser(student);
    await saveActivity({ studentId: student.id, service: "admin-marketplace", action: "access-revoked", status: "completed", creditsUsed: 0, note: `Removed ${removed.name || body.itemId} access`, source: "admin" });
    return Response.json({ removed: body.itemId, purchases: student.marketplacePurchases });
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
