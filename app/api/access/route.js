import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser, isVerifiedUser, saveUser } from "../../../lib/storage";
import { creditCost } from "../../../lib/pricing";

export const runtime = "nodejs";

const cookieName = "astra_session";
const services = [
  { id: "ai", name: "AI learning tools", description: "Use approved AI features through the academy gateway." },
  { id: "assets", name: "Workshop resources", description: "Access permitted images, videos, and learning files." },
  { id: "profile", name: "Student profile", description: "Manage your registered account information." }
];

const endpoints = [
  { id: "responses", category: "generative", name: "GPT-4.1 Generative", model: "gpt-4.1", method: "POST", path: "/api/proxy/responses", auth: "Student API key", description: "Send prompts through GPT-4.1 via the APIM gateway." },
  { id: "luna", category: "generative", name: "GPT-5.6 Luna Generative", model: "gpt-5.6-luna", method: "POST", path: "/api/proxy/responses?model=gpt-5.6-luna", auth: "Student API key", description: "Send prompts through the GPT-5.6 Luna APIM deployment." },
  { id: "image-2", category: "image", name: "GPT Image 2", model: "gpt-image-2", method: "POST", path: "/api/proxy/images?model=gpt-image-2", auth: "Student API key", description: "Generate and edit images through the East US 2 APIM deployment." },
  { id: "image-flare", category: "image", name: "GPT Image 2.5 Flare", model: "gpt-image-2.5-flare", method: "POST", path: "/api/proxy/images?model=gpt-image-2.5-flare", auth: "Student API key", description: "Fast everyday image generation through the East US 2 APIM deployment." },
  { id: "sora-2", category: "video", name: "Sora 2 Video", model: "sora-2", method: "POST", path: "/api/proxy/videos?model=sora-2", auth: "Student API key", description: "Create video jobs with Sora 2 through the East US 2 APIM deployment." },
  { id: "access", category: "other", name: "Authentication", method: "GET", path: "/api/access", auth: "Dashboard session", description: "Read the services and endpoints assigned to this student." },
  { id: "resources", category: "other", name: "Storage", method: "GET / POST", path: "/api/resources", auth: "Dashboard session", description: "List and upload your private learning resources." },
  { id: "activity", category: "other", name: "Database", method: "GET", path: "/api/activity", auth: "Dashboard session", description: "View calls and credit usage recorded for your account." },
  { id: "apim-test", category: "other", name: "Gateway health check", method: "GET", path: "/api/apim-test", auth: "Dashboard session", description: "Test whether the configured APIM gateway is reachable." }
];

function sessionId() {
  try {
    const [payload, signature] = cookies().get(cookieName)?.value.split(".") || [];
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.expires > Date.now() ? session.id : null;
  } catch { return null; }
}

function newApiKey() {
  const key = `bma_${crypto.randomBytes(32).toString("base64url")}`;
  return { key, hash: crypto.createHash("sha256").update(key).digest("hex"), prefix: key.slice(0, 12) };
}

function codexUnlocked(user) {
  return new Date(user.codexAccessUntil || 0).getTime() > Date.now();
}

export async function GET() {
  const user = await getUser(sessionId());
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const unlocked = codexUnlocked(user);
  return Response.json({ services, endpoints: endpoints.map((endpoint) => ({ ...endpoint, creditCost: endpoint.id === "apim-test" ? creditCost("apim-test") : endpoint.model ? creditCost(endpoint.category === "image" ? "images" : endpoint.category === "video" ? "videos" : "responses", endpoint.model) : 0 })), apiKeyPrefix: unlocked ? user.apiKeyPrefix || null : null, apiKeyLocked: !unlocked, apiEndpoint: "/api/proxy/responses" });
}

export async function POST() {
  const user = await getUser(sessionId());
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  if (!codexUnlocked(user)) return Response.json({ error: "Unlock Codex with 5 credits to access your API key." }, { status: 403 });
  const apiKey = newApiKey();
  user.apiKeyHash = apiKey.hash;
  user.apiKeyPrefix = apiKey.prefix;
  user.updatedAt = new Date().toISOString();
  await saveUser(user);
  return Response.json({ apiKey: apiKey.key, apiKeyPrefix: apiKey.prefix });
}
