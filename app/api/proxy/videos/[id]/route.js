import { getStudentVideoJob, updateVideoJobState } from "../../../../../lib/activity";
import { hasMarketplaceAccess } from "../../../../../lib/marketplace";
import { getUserByApiKey, isVerifiedUser } from "../../../../../lib/storage";

export const runtime = "nodejs";

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

function validId(value) {
  return /^[A-Za-z0-9_-]{1,200}$/.test(value || "");
}

function videoState(value) {
  return value?.status || value?.state || value?.data?.status || value?.data?.state || "unknown";
}

export async function GET(request, { params }) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  if (!hasMarketplaceAccess(user, "sora-2")) return Response.json({ error: "Buy Sora 2 in the marketplace to access video jobs." }, { status: 403 });
  const id = params?.id;
  if (!validId(id)) return Response.json({ error: "Invalid video job ID." }, { status: 400 });
  const job = await getStudentVideoJob(user.id, id);
  if (!job) return Response.json({ error: "Video job not found for this API key." }, { status: 404 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  try {
    const response = await fetch(`${gateway}/videos/videos/${encodeURIComponent(id)}`, {
      headers: { "Ocp-Apim-Subscription-Key": apimKey },
      cache: "no-store"
    });
    const result = await response.text();
    if (response.ok) {
      try {
        const parsed = JSON.parse(result);
        await updateVideoJobState(job, videoState(parsed), parsed?.error?.message || parsed?.error || parsed?.message).catch(() => {});
      } catch {}
    }
    return new Response(result, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" }
    });
  } catch (error) {
    return Response.json({ error: error.message || "Could not retrieve video status." }, { status: 502 });
  }
}
