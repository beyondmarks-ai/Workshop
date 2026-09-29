import { getStudentVideoJob } from "../../../../../lib/activity";
import { hasMarketplaceAccess, marketplaceItems } from "../../../../../lib/marketplace";
import { getUserByApiKey, isVerifiedUser } from "../../../../../lib/storage";

export const runtime = "nodejs";

const videoModels = new Set(marketplaceItems().filter((item) => item.category === "Vertex AI" && item.kind === "video").map((item) => item.id));

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

function operationModel(name) {
  return /^projects\/[^/]+\/locations\/[^/]+\/publishers\/google\/models\/([^/]+)\/operations\/[^/]+$/.exec(name || "")?.[1] || null;
}

function videoAsset(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.bytesBase64Encoded === "string") return { bytes: value.bytesBase64Encoded, mimeType: value.mimeType || "video/mp4" };
  if (typeof value.videoBytes === "string") return { bytes: value.videoBytes, mimeType: value.mimeType || "video/mp4" };
  for (const child of Object.values(value)) {
    const found = videoAsset(child);
    if (found) return found;
  }
  return null;
}

function rangedVideo(request, buffer, mimeType) {
  const headers = new Headers({ "content-type": mimeType, "accept-ranges": "bytes", "cache-control": "private, no-store" });
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (!range) {
    headers.set("content-length", String(buffer.length));
    return new Response(buffer, { status: 200, headers });
  }
  const start = range[1] ? Number(range[1]) : 0;
  const end = range[2] ? Math.min(Number(range[2]), buffer.length - 1) : buffer.length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= buffer.length) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${buffer.length}` } });
  }
  const chunk = buffer.subarray(start, end + 1);
  headers.set("content-length", String(chunk.length));
  headers.set("content-range", `bytes ${start}-${end}/${buffer.length}`);
  return new Response(chunk, { status: 206, headers });
}

export async function GET(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const name = new URL(request.url).searchParams.get("name");
  const model = operationModel(name);
  if (!model || !videoModels.has(model)) return Response.json({ error: "A valid Vertex video operation is required." }, { status: 400 });
  if (!hasMarketplaceAccess(user, model)) return Response.json({ error: "Buy this model in the marketplace to access its video content." }, { status: 403 });
  if (!await getStudentVideoJob(user.id, name)) return Response.json({ error: "Video job not found for this API key." }, { status: 404 });

  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  try {
    const response = await fetch(`${gateway}/vertex/operation?name=${encodeURIComponent(name)}`, { headers: { "Ocp-Apim-Subscription-Key": apimKey }, cache: "no-store" });
    const text = await response.text();
    if (!response.ok) return new Response(text, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } });
    const result = JSON.parse(text);
    if (result?.error) return Response.json({ error: result.error }, { status: 502 });
    if (result?.done !== true) return Response.json({ error: "Video generation is still running." }, { status: 409 });
    const asset = videoAsset(result);
    if (!asset) return Response.json({ error: "The completed operation did not contain video data." }, { status: 502 });
    return rangedVideo(request, Buffer.from(asset.bytes, "base64"), asset.mimeType);
  } catch (error) {
    return Response.json({ error: error.message || "Could not retrieve Vertex video content." }, { status: 502 });
  }
}
