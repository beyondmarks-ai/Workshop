import crypto from "node:crypto";
import { cookies } from "next/headers";
import { unlockCodex } from "../../../lib/storage";

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

export async function POST() {
  const result = await unlockCodex(sessionId());
  if (!result.allowed) return Response.json(result, { status: result.reason === "Not signed in." ? 401 : 402 });
  return Response.json(result);
}
