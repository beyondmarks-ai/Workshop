export const runtime = "nodejs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser, isVerifiedUser } from "../../../lib/storage";
import { creditCost } from "../../../lib/pricing";
import { finishUsageCharge, startUsageCharge } from "../../../lib/billing";

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
  if (!isVerifiedUser(await getUser(id))) return Response.json({ ok: false, error: "Your account is waiting for admin verification." }, { status: 403 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const subscriptionKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !subscriptionKey) return Response.json({ ok: false, error: "APIM tester is not configured." }, { status: 503 });
  const model = process.env.APIM_TEST_MODEL || "gpt-5-4-mini-fast";
  const credit = await startUsageCharge(id, creditCost("apim-test"), { service: "apim-test", action: "health-check", model, request: { model } });
  if (!credit.allowed) return Response.json({ ok: false, error: "No credits remaining.", credits: 0 }, { status: 429 });

  try {
    const response = await fetch(`${gateway}/openai/responses?api-version=2025-03-01-preview`, {
      method: "POST",
      headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": subscriptionKey },
      body: JSON.stringify({ model, input: "Health check. Reply with OK." })
    });
    const ok = response.ok;
    await finishUsageCharge(credit, { studentId: id, httpStatus: response.status, response: ok ? "Health check completed." : await response.text() }).catch(() => {});
    return Response.json({ ok, status: response.status, credits: credit.credits, message: ok ? "APIM endpoint is reachable." : "APIM endpoint check failed." }, { status: ok ? 200 : 502 });
  } catch (error) {
    await finishUsageCharge(credit, { studentId: id, httpStatus: 502, error: error.message || "APIM endpoint is unreachable." }).catch(() => {});
    return Response.json({ ok: false, credits: credit.credits, error: error.message || "APIM endpoint is unreachable." }, { status: 502 });
  }
}
