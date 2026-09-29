import { getUserByApiKey, isVerifiedUser } from "../../../../lib/storage";
import { hasMarketplaceAccess, marketplaceItems } from "../../../../lib/marketplace";
import { creditCost } from "../../../../lib/pricing";
import { finishUsageCharge, startUsageCharge } from "../../../../lib/billing";
import { getStudentVideoJob, updateVideoJobState } from "../../../../lib/activity";

export const runtime = "nodejs";

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

const allowedModels = new Map(marketplaceItems().filter((item) => item.category === "Vertex AI" && item.kind !== "tools").map((item) => [item.id, item.kind]));

function suppliedModel(request) {
  const requested = new URL(request.url).searchParams.get("model");
  if (!requested) return "gemini-2.5-flash";
  return allowedModels.has(requested) ? requested : null;
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
  if (!model) return Response.json({ error: "This Vertex model is not available through BeyondMarks." }, { status: 400 });
  if (!hasMarketplaceAccess(user, model)) return Response.json({ error: "Buy this model in the marketplace to unlock its endpoint." }, { status: 403 });
  const operation = operationFor(allowedModels.get(model), query.get("operation"));
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  const body = await request.text();
  try { JSON.parse(body); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const cost = creditCost("vertex", model);
  const credit = await startUsageCharge(user.id, cost, { service: "vertex", action: operation, model, request: { model, operation } });
  if (!credit.allowed) return Response.json({ error: "No credits remaining." }, { status: 429 });
  try {
    const response = await fetch(`${gateway}/vertex/${operation}/${encodeURIComponent(model)}`, { method: "POST", headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": apimKey }, body });
    const result = await response.text();
    let operationName = null;
    if (response.ok && operation === "predictLongRunning") {
      try { operationName = JSON.parse(result)?.name || null; } catch {}
    }
    await finishUsageCharge(credit, { studentId: user.id, httpStatus: response.status, response: result, videoJobId: operationName }).catch(() => {});
    return new Response(result, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "x-credits-remaining": String(credit.credits) } });
  } catch (error) {
    await finishUsageCharge(credit, { studentId: user.id, httpStatus: 502, error: error.message || "Could not reach Vertex gateway." }).catch(() => {});
    return Response.json({ error: error.message || "Could not reach Vertex gateway.", credits: credit.credits }, { status: 502 });
  }
}

function operationModel(name) {
  return /^projects\/[^/]+\/locations\/[^/]+\/publishers\/google\/models\/([^/]+)\/operations\/[^/]+$/.exec(name || "")?.[1] || null;
}

export async function GET(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const name = new URL(request.url).searchParams.get("name");
  const model = operationModel(name);
  if (!model || allowedModels.get(model) !== "video") return Response.json({ error: "A valid Vertex video operation is required." }, { status: 400 });
  if (!hasMarketplaceAccess(user, model)) return Response.json({ error: "Buy this model in the marketplace to access its video jobs." }, { status: 403 });
  const job = await getStudentVideoJob(user.id, name);
  if (!job) return Response.json({ error: "Video job not found for this API key." }, { status: 404 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!name || !name.startsWith("projects/") || !gateway || !apimKey) return Response.json({ error: "A valid Vertex operation and gateway are required." }, { status: 400 });
  const response = await fetch(`${gateway}/vertex/operation?name=${encodeURIComponent(name)}`, { headers: { "Ocp-Apim-Subscription-Key": apimKey }, cache: "no-store" });
  const result = await response.text();
  if (response.ok) {
    try {
      const parsed = JSON.parse(result);
      const state = parsed?.error ? "failed" : parsed?.done === true ? "completed" : "running";
      await updateVideoJobState(job, state, parsed?.error?.message || parsed?.error).catch(() => {});
    } catch {}
  }
  return new Response(result, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
}
