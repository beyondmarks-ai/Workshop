export const runtime = "nodejs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { consumeCredit } from "../../../lib/storage";

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
  const id = sessionId();
  if (!id) return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const credit = await consumeCredit(id);
  if (!credit.allowed) return Response.json({ ok: false, error: "No credits remaining.", credits: 0 }, { status: 429 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const subscriptionKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !subscriptionKey) return Response.json({ ok: false, credits: credit.credits, error: "APIM tester is not configured." }, { status: 503 });

  try {
    const response = await fetch(`${gateway}/openai/responses?api-version=2025-03-01-preview`, {
      method: "POST",
      headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": subscriptionKey },
      body: JSON.stringify({ model: process.env.APIM_TEST_MODEL || "gpt-5-4-mini-fast", input: "Health check. Reply with OK." })
    });
    const ok = response.ok;
    return Response.json({ ok, status: response.status, credits: credit.credits, message: ok ? "APIM endpoint is reachable." : "APIM endpoint check failed." }, { status: ok ? 200 : 502 });
  } catch (error) {
    return Response.json({ ok: false, credits: credit.credits, error: error.message || "APIM endpoint is unreachable." }, { status: 502 });
  }
}
