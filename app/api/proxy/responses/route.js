import { consumeCredit, getUserByApiKey } from "../../../../lib/storage";
import { saveActivity } from "../../../../lib/activity";

export const runtime = "nodejs";

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

export async function POST(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  const credit = await consumeCredit(user.id);
  if (!credit.allowed) return Response.json({ error: "No credits remaining." }, { status: 429 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  try {
    const rawBody = await request.text();
    let body;
    try { body = JSON.parse(rawBody); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    body.model = process.env.APIM_TEST_MODEL || "gpt-5.6-luna";
    const response = await fetch(`${gateway}/openai/responses?api-version=2025-03-01-preview`, { method: "POST", headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": apimKey }, body: JSON.stringify(body) });
    const result = await response.text();
    await saveActivity({ studentId: user.id, service: "foundry-responses", action: "responses", status: response.status, creditsUsed: 1, request: { model: body.model, input: body.input }, response: result.slice(0, 12000) }).catch(() => {});
    return new Response(result, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "x-credits-remaining": String(credit.credits) } });
  } catch (error) {
    return Response.json({ error: error.message || "Could not reach API gateway.", credits: credit.credits }, { status: 502 });
  }
}
