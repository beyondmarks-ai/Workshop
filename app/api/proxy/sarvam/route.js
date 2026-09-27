import { consumeCredit, getUserByApiKey, isVerifiedUser } from "../../../../lib/storage";
import { saveActivity } from "../../../../lib/activity";
import { creditCost } from "../../../../lib/pricing";
import { hasMarketplaceAccess } from "../../../../lib/marketplace";

export const runtime = "nodejs";

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

const services = {
  tts: { item: "sarvam-bulbul-v3", cost: 1, path: "/text-to-speech" },
  stt: { item: "sarvam-saaras-v3", cost: 1, path: "/speech-to-text" },
  translate: { item: "sarvam-translate-v1", cost: 0.5, path: "/translate" }
};

export async function POST(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const service = services[new URL(request.url).searchParams.get("service") || "tts"];
  if (!service || !hasMarketplaceAccess(user, service.item)) return Response.json({ error: "Buy this Sarvam service in the marketplace to unlock its endpoint." }, { status: 403 });
  const credit = await consumeCredit(user.id, service.cost);
  if (!credit.allowed) return Response.json({ error: "No credits remaining." }, { status: 429 });
  const gateway = process.env.APIM_GATEWAY_URL?.replace(/\/$/, "");
  const apimKey = process.env.APIM_SUBSCRIPTION_KEY;
  if (!gateway || !apimKey) return Response.json({ error: "API gateway is not configured." }, { status: 503 });
  try {
    const headers = { "Ocp-Apim-Subscription-Key": apimKey };
    let body;
    if (service.item === "sarvam-saaras-v3") {
      const contentType = request.headers.get("content-type") || "";
      const form = new FormData();
      if (contentType.includes("multipart/form-data")) {
        const input = await request.formData();
        for (const [name, value] of input.entries()) form.append(name, value);
      } else {
        const audio = await request.arrayBuffer();
        form.append("file", new Blob([audio], { type: contentType || "audio/wav" }), "audio.wav");
      }
      body = form;
    } else {
      const input = await request.json();
      if (service.item === "sarvam-bulbul-v3") { input.model = "bulbul:v3"; input.speaker ||= "priya"; input.target_language_code ||= "en-IN"; }
      if (service.item === "sarvam-translate-v1") { input.model = "sarvam-translate:v1"; }
      headers["content-type"] = "application/json";
      body = JSON.stringify(input);
    }
    const response = await fetch(`${gateway}/sarvam${service.path}`, { method: "POST", headers, body });
    const result = await response.arrayBuffer();
    await saveActivity({ studentId: user.id, service: "sarvam", action: service.item, status: response.status, creditsUsed: service.cost, request: { service: service.item }, response: Buffer.from(result).toString("base64").slice(0, 12000) }).catch(() => {});
    return new Response(result, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "x-credits-remaining": String(credit.credits) } });
  } catch (error) {
    return Response.json({ error: error.message || "Could not reach API gateway.", credits: credit.credits }, { status: 502 });
  }
}
