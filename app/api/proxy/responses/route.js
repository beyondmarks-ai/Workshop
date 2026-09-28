import { getUserByApiKey, isVerifiedUser } from "../../../../lib/storage";
import { creditCost } from "../../../../lib/pricing";
import { hasMarketplaceAccess } from "../../../../lib/marketplace";
import { finishUsageCharge, startUsageCharge } from "../../../../lib/billing";

export const runtime = "nodejs";

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

export async function POST(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const rawBody = await request.text();
  let body;
  try { body = JSON.parse(rawBody); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const requestedModel = new URL(request.url).searchParams.get("model") || String(body.model || "") || process.env.APIM_TEST_MODEL || "gpt-5.6-luna";
  const supportedModels = ["gpt-4.1", "gpt-6-astra", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"];
  if (!supportedModels.includes(requestedModel)) {
    return Response.json({ error: `Model '${requestedModel}' is not available through BeyondMarks Codex.` }, { status: 400 });
  }
  const model = requestedModel;
  if (!hasMarketplaceAccess(user, model)) return Response.json({ error: "Buy this model in the marketplace to unlock its endpoint." }, { status: 403 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  const cost = creditCost("responses", model);
  const credit = await startUsageCharge(user.id, cost, { service: "foundry-responses", action: "responses", model, request: { model, input: body.input } });
  if (!credit.allowed) return Response.json({ error: "No credits remaining." }, { status: 429 });
  try {
    body.model = model;
    const response = await fetch(`${gateway}/openai/responses?api-version=2025-03-01-preview`, { method: "POST", headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": apimKey }, body: JSON.stringify(body) });
    const result = await response.text();
    await finishUsageCharge(credit, { studentId: user.id, httpStatus: response.status, response: result }).catch(() => {});
    return new Response(result, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "x-credits-remaining": String(credit.credits) } });
  } catch (error) {
    await finishUsageCharge(credit, { studentId: user.id, httpStatus: 502, error: error.message || "Could not reach API gateway." }).catch(() => {});
    return Response.json({ error: error.message || "Could not reach API gateway.", credits: credit.credits }, { status: 502 });
  }
}
