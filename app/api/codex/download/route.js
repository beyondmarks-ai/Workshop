import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getStoredFile, getUser } from "../../../../lib/storage";

export const runtime = "nodejs";

function sessionId() {
  try {
    const [payload, signature] = cookies().get("astra_session")?.value.split(".") || [];
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.expires > Date.now() ? session.id : null;
  } catch { return null; }
}

export async function GET() {
  const user = await getUser(sessionId());
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (new Date(user.codexAccessUntil || 0).getTime() <= Date.now()) return Response.json({ error: "Unlock Codex to download the Windows setup." }, { status: 403 });
  const file = await getStoredFile("codex-tools", "beyondmarks-codex-windows-setup.zip");
  return new Response(file.data, { headers: {
    "content-type": "application/zip",
    "content-disposition": 'attachment; filename="beyondmarks-codex-windows-setup.zip"',
    "content-length": String(file.data.length),
    "cache-control": "private, no-store",
  } });
}
