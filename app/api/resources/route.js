import crypto from "node:crypto";
import { cookies } from "next/headers";
import { listStudentResources, uploadStudentResource } from "../../../lib/storage";

export const runtime = "nodejs";

async function sessionId() {
  try {
    const [payload, signature] = cookies().get("astra_session")?.value.split(".") || [];
    const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
    if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.expires > Date.now() ? session.id : null;
  } catch { return null; }
}

export async function GET() {
  const id = await sessionId();
  if (!id) return Response.json({ error: "Not signed in." }, { status: 401 });
  return Response.json({ resources: await listStudentResources(id) });
}

export async function POST(request) {
  const id = await sessionId();
  if (!id) return Response.json({ error: "Not signed in." }, { status: 401 });
  const body = await request.formData();
  const file = body.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return Response.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > 100 * 1024 * 1024) return Response.json({ error: "Maximum file size is 100 MB." }, { status: 413 });
  return Response.json({ resource: await uploadStudentResource(id, file) }, { status: 201 });
}
