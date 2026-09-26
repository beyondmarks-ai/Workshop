import { consumeCredit, getUserByApiKey, isVerifiedUser } from "../../../../lib/storage";
import { saveActivity } from "../../../../lib/activity";
import { creditCost } from "../../../../lib/pricing";
import { hasMarketplaceAccess } from "../../../../lib/marketplace";

export const runtime = "nodejs";

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

export async function POST(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const model = new URL(request.url).searchParams.get("model") || "claude-sonnet";
  if (model !== "claude-sonnet" || !hasMarketplaceAccess(user, model)) return Response.json({ error: "Buy this model in the marketplace to unlock its endpoint." }, { status: 403 });
  const credit = await consumeCredit(user.id, creditCost("claude", model));
  if (!credit.allowed) return Response.json({ error: "No credits remaining." }, { status: 429 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);
    body.model = "claude-sonnet-5";
    const response = await fetch(`${gateway}/claude/messages`, { method: "POST", headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": apimKey }, body: JSON.stringify(body) });
    const result = await response.text();
    await saveActivity({ studentId: user.id, service: "claude", action: "messages", status: response.status, creditsUsed: creditCost("claude", model), request: { model: body.model }, response: result.slice(0, 12000) }).catch(() => {});
    return new Response(result, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "x-credits-remaining": String(credit.credits) } });
  } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? "Request body must be valid JSON." : error.message || "Could not reach API gateway.", credits: credit.credits }, { status: error instanceof SyntaxError ? 400 : 502 });
  }
}
