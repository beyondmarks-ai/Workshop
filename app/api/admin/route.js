import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser, listAllStudentResources, listMaterials, listUsers } from "../../../lib/storage";
import { listActivities } from "../../../lib/activity";

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
  const admin = await currentUser();
  if (!admin || admin.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const [users, materials, studentResources, activities] = await Promise.all([listUsers(), listMaterials(), listAllStudentResources(), listActivities()]);
  return Response.json({
    users: users.map(({ passwordHash, passwordSalt, apiKeyHash, ...user }) => user),
    materials,
    studentResources,
    activities,
    summary: { students: users.filter((user) => user.role === "student").length, resources: materials.length + studentResources.length, credits: users.reduce((total, user) => total + (user.credits ?? 100), 0) }
  });
}
