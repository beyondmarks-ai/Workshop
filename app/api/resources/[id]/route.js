import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getStudentResource } from "../../../../lib/storage";

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

export async function GET(request, { params }) {
  const id = await sessionId();
  if (!id || !/^[0-9a-f-]{36}$/.test(params.id)) return new Response("Not found.", { status: 404 });
  const resource = await getStudentResource(id, params.id);
  if (!resource) return new Response("Not found.", { status: 404 });
  return new Response(resource.data, { headers: { "content-type": resource.contentType, "content-disposition": `inline; filename="${resource.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"` } });
}
