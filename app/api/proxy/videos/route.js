import { getUserByApiKey, isVerifiedUser } from "../../../../lib/storage";
import { creditCost } from "../../../../lib/pricing";
import { hasMarketplaceAccess } from "../../../../lib/marketplace";
import { finishUsageCharge, startUsageCharge } from "../../../../lib/billing";

export const runtime = "nodejs";

function videoId(result) {
  try {
    const value = JSON.parse(result);
    return value?.id || value?.video_id || value?.data?.id || value?.operation?.id || null;
  } catch {
    return null;
  }
}

function responseHeaders(response, credits) {
  const headers = new Headers({
    "content-type": response.headers.get("content-type") || "application/json",
    "x-credits-remaining": String(credits)
  });
  for (const name of ["retry-after", "x-request-id", "request-id"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

export async function POST(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const requestedModel = new URL(request.url).searchParams.get("model");
  const model = requestedModel === "sora-2" ? "sora-2" : process.env.APIM_VIDEO_MODEL || "sora-2";
  if (!hasMarketplaceAccess(user, model)) return Response.json({ error: "Buy this model in the marketplace to unlock its endpoint." }, { status: 403 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const cost = creditCost("videos", model);
  const credit = await startUsageCharge(user.id, cost, { service: "videos", action: "video-generation", model, request: { model, prompt: body.prompt } });
  if (!credit.allowed) return Response.json({ error: "No credits remaining." }, { status: 429 });
  try {
    body.model = model;
    const response = await fetch(`${gateway}/videos/videos`, {
      method: "POST",
      headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": apimKey },
      body: JSON.stringify(body)
    });
    const result = await response.text();
    const id = response.ok ? videoId(result) : null;
    await finishUsageCharge(credit, { studentId: user.id, httpStatus: response.status, response: result, videoJobId: id }).catch(() => {});
    return new Response(result, { status: response.status, headers: responseHeaders(response, credit.credits) });
  } catch (error) {
    await finishUsageCharge(credit, { studentId: user.id, httpStatus: 502, error: error.message || "Could not reach video endpoint." }).catch(() => {});
    return Response.json({ error: error.message || "Could not reach video endpoint.", credits: credit.credits }, { status: 502 });
  }
}
