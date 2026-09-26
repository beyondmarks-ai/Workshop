import { consumeCredit, getUserByApiKey, isVerifiedUser } from "../../../../lib/storage";
import { creditCost } from "../../../../lib/pricing";

export const runtime = "nodejs";

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

export async function POST(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const requestedModel = new URL(request.url).searchParams.get("model");
  const model = ["gpt-image-2", "gpt-image-2.5-flare"].includes(requestedModel) ? requestedModel : process.env.APIM_IMAGE_MODEL || "gpt-image-2";
  const cost = creditCost("images", model);
  const credit = await consumeCredit(user.id, cost);
  if (!credit.allowed) return Response.json({ error: "No credits remaining." }, { status: 429 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  try {
    const body = await request.json();
    body.model = model;
    const response = await fetch(`${gateway}/images/${body.model}/images/generations?api-version=2025-04-01-preview`, {
      method: "POST",
      headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": apimKey },
      body: JSON.stringify(body)
    });
    const result = await response.text();
    return new Response(result, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "x-credits-remaining": String(credit.credits) } });
  } catch (error) {
    return Response.json({ error: error.message || "Could not reach image endpoint.", credits: credit.credits }, { status: 502 });
  }
}
