import { consumeCredit, getUserByApiKey, isVerifiedUser } from "../../../../lib/storage";
import { saveActivity } from "../../../../lib/activity";
import { marketplaceItems } from "../../../../lib/marketplace";
import { creditCost } from "../../../../lib/pricing";

export const runtime = "nodejs";

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

const allowedModels = new Map(marketplaceItems().filter((item) => item.category === "Vertex AI" && item.kind !== "tools").map((item) => [item.id, item.kind]));

function suppliedModel(request) {
  const requested = new URL(request.url).searchParams.get("model") || "gemini-2.5-flash";
  return allowedModels.has(requested) ? requested : "gemini-2.5-flash";
}

function operationFor(kind, requested) {
  if (requested && !["generate", "predict", "predictLongRunning", "embedContent"].includes(requested)) return "generate";
  if (requested) return requested;
  return kind === "video" ? "predictLongRunning" : kind === "embeddings" ? "embedContent" : kind === "image" ? "generate" : "generate";
}

export async function POST(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const query = new URL(request.url).searchParams;
  const model = suppliedModel(request);
  const operation = operationFor(allowedModels.get(model), query.get("operation"));
  const cost = creditCost("vertex", model);
  const credit = await consumeCredit(user.id, cost);
  if (!credit.allowed) return Response.json({ error: "No credits remaining." }, { status: 429 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  try {
    const body = await request.text();
    const response = await fetch(`${gateway}/vertex/${operation}/${encodeURIComponent(model)}`, { method: "POST", headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": apimKey }, body });
    const result = await response.text();
    await saveActivity({ studentId: user.id, service: "vertex", action: "generate-content", status: response.status, creditsUsed: cost, request: { model }, response: result.slice(0, 12000) }).catch(() => {});
    return new Response(result, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "x-credits-remaining": String(credit.credits) } });
  } catch (error) {
    return Response.json({ error: error.message || "Could not reach Vertex gateway.", credits: credit.credits }, { status: 502 });
  }
}

export async function GET(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const name = new URL(request.url).searchParams.get("name");
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!name || !name.startsWith("projects/") || !gateway || !apimKey) return Response.json({ error: "A valid Vertex operation and gateway are required." }, { status: 400 });
  const response = await fetch(`${gateway}/vertex/operation?name=${encodeURIComponent(name)}`, { headers: { "Ocp-Apim-Subscription-Key": apimKey } });
  return new Response(await response.text(), { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } });
}
