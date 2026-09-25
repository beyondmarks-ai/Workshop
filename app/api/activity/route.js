import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser } from "../../../lib/storage";
import { listStudentActivities } from "../../../lib/activity";

export const runtime = "nodejs";

async function sessionUser() {
  try {
    const [payload, signature] = cookies().get("astra_session")?.value.split(".") || [];
    const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
    if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.expires > Date.now() ? await getUser(session.id) : null;
  } catch { return null; }
}

export async function GET() {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  return Response.json({ database: process.env.COSMOS_DATABASE || "academy", container: process.env.COSMOS_CONTAINER || "activity", partitionKey: "/studentId", studentId: user.id, activities: await listStudentActivities(user.id) });
}
