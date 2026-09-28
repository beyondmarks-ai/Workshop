import { getStudentVideoJob } from "../../../../../../lib/activity";
import { hasMarketplaceAccess } from "../../../../../../lib/marketplace";
import { getUserByApiKey, isVerifiedUser } from "../../../../../../lib/storage";

export const runtime = "nodejs";

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

export async function GET(request, { params }) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  if (!hasMarketplaceAccess(user, "sora-2")) return Response.json({ error: "Buy Sora 2 in the marketplace to access video jobs." }, { status: 403 });
  const id = params?.id;
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id || "")) return Response.json({ error: "Invalid video job ID." }, { status: 400 });
  if (!await getStudentVideoJob(user.id, id)) return Response.json({ error: "Video job not found for this API key." }, { status: 404 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  try {
    const headers = { "Ocp-Apim-Subscription-Key": apimKey };
    const range = request.headers.get("range");
    if (range) headers.range = range;
    const response = await fetch(`${gateway}/videos/videos/${encodeURIComponent(id)}/content`, { headers, redirect: "follow", cache: "no-store" });
    const outputHeaders = new Headers();
    for (const name of ["content-type", "content-length", "content-disposition", "accept-ranges", "content-range", "etag", "last-modified"]) {
      const value = response.headers.get(name);
      if (value) outputHeaders.set(name, value);
    }
    outputHeaders.set("cache-control", "private, no-store");
    return new Response(response.body, { status: response.status, headers: outputHeaders });
  } catch (error) {
    return Response.json({ error: error.message || "Could not retrieve video content." }, { status: 502 });
  }
}
