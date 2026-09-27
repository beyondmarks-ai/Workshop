import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser, isVerifiedUser, saveUser } from "../../../lib/storage";
import { hasMarketplaceAccess, marketplaceItems } from "../../../lib/marketplace";
import { creditCost } from "../../../lib/pricing";
import { createStudentApiKey, decryptApiKey } from "../../../lib/api-key";

export const runtime = "nodejs";

const cookieName = "astra_session";
const services = [
  { id: "ai", name: "AI learning tools", description: "Use approved AI features through the academy gateway." },
  { id: "assets", name: "Workshop resources", description: "Access permitted images, videos, and learning files." },
  { id: "profile", name: "Student profile", description: "Manage your registered account information." }
];

const endpoints = [
  { id: "responses", category: "generative", name: "GPT-4.1 Generative", model: "gpt-4.1", method: "POST", path: "/api/proxy/responses", auth: "Student API key", description: "Send prompts through GPT-4.1 via the APIM gateway." },
  { id: "astra", category: "generative", name: "GPT-6 Astra Generative", model: "gpt-6-astra", method: "POST", path: "/api/proxy/responses?model=gpt-6-astra", auth: "Student API key", description: "Send prompts through the GPT-6 Astra APIM deployment." },
  { id: "luna", category: "generative", name: "GPT-5.6 Luna Generative", model: "gpt-5.6-luna", method: "POST", path: "/api/proxy/responses?model=gpt-5.6-luna", auth: "Student API key", description: "Send prompts through the GPT-5.6 Luna APIM deployment." },
  { id: "terra", category: "generative", name: "GPT-5.6 Terra Generative", model: "gpt-5.6-terra", method: "POST", path: "/api/proxy/responses?model=gpt-5.6-terra", auth: "Student API key", description: "Send prompts through the GPT-5.6 Terra APIM deployment." },
  { id: "sol", category: "generative", name: "GPT-5.6 Sol Generative", model: "gpt-5.6-sol", method: "POST", path: "/api/proxy/responses?model=gpt-5.6-sol", auth: "Student API key", description: "Send prompts through the GPT-5.6 Sol APIM deployment." },
  { id: "claude-sonnet", category: "generative", name: "Claude Sonnet 5", model: "claude-sonnet", method: "POST", path: "/api/proxy/claude?model=claude-sonnet", auth: "Student API key", description: "Send prompts through the Claude Sonnet 5 Azure AI Foundry deployment." },
  { id: "claude-haiku", category: "generative", name: "Claude Haiku 4.5", model: "claude-haiku", method: "POST", path: "/api/proxy/claude?model=claude-haiku", auth: "Student API key", description: "Send prompts through the Claude Haiku 4.5 Azure AI Foundry deployment." },
  { id: "claude-opus", category: "generative", name: "Claude Opus 5", model: "claude-opus", method: "POST", path: "/api/proxy/claude?model=claude-opus", auth: "Student API key", description: "Send prompts through the Claude Opus 5 Azure AI Foundry deployment." },
  { id: "sarvam-tts", category: "audio", name: "Sarvam Bulbul v3 Voices", model: "sarvam-bulbul-v3", method: "POST", path: "/api/proxy/sarvam?service=tts", auth: "Student API key", description: "Generate speech with 38 Sarvam Bulbul v3 voices." },
  { id: "sarvam-stt", category: "audio", name: "Sarvam Saaras v3", model: "sarvam-saaras-v3", method: "POST", path: "/api/proxy/sarvam?service=stt", auth: "Student API key", description: "Transcribe audio in supported Indian languages." },
  { id: "sarvam-translate", category: "other", name: "Sarvam Translate", model: "sarvam-translate-v1", method: "POST", path: "/api/proxy/sarvam?service=translate", auth: "Student API key", description: "Translate between supported Indian languages." },
  { id: "image-2", category: "image", name: "GPT Image 2", model: "gpt-image-2", method: "POST", path: "/api/proxy/images?model=gpt-image-2", auth: "Student API key", description: "Generate and edit images through the East US 2 APIM deployment." },
  { id: "image-flare", category: "image", name: "GPT Image 2.5 Flare", model: "gpt-image-2.5-flare", method: "POST", path: "/api/proxy/images?model=gpt-image-2.5-flare", auth: "Student API key", description: "Fast everyday image generation through the East US 2 APIM deployment." },
  { id: "sora-2", category: "video", name: "Sora 2 Video", model: "sora-2", method: "POST", path: "/api/proxy/videos?model=sora-2", auth: "Student API key", description: "Create video jobs with Sora 2 through the East US 2 APIM deployment." },
  { id: "vertex-gemini-2-5-flash", category: "generative", name: "Vertex Gemini 2.5 Flash", model: "gemini-2.5-flash", method: "POST", path: "/api/proxy/vertex?model=gemini-2.5-flash", auth: "Student API key", description: "Generate content through Google Vertex AI via the APIM gateway." },
  { id: "vertex-image", category: "image", name: "Vertex Gemini Image", model: "gemini-2.5-flash-image", method: "POST", path: "/api/proxy/vertex?model=gemini-2.5-flash-image", auth: "Student API key", description: "Generate images through Vertex AI using the APIM gateway." },
  { id: "vertex-video", category: "video", name: "Vertex Veo 3.1", model: "veo-3.1-generate-001", method: "POST", path: "/api/proxy/vertex?model=veo-3.1-generate-001", auth: "Student API key", description: "Start a long-running Veo video generation job through APIM." },
  { id: "vertex-audio", category: "other", name: "Vertex Gemini TTS", model: "gemini-2.5-flash-tts", method: "POST", path: "/api/proxy/vertex?model=gemini-2.5-flash-tts", auth: "Student API key", description: "Generate speech through Vertex AI using the APIM gateway." },
  { id: "vertex-embedding", category: "other", name: "Vertex Embeddings", model: "gemini-embedding-2", method: "POST", path: "/api/proxy/vertex?model=gemini-embedding-2", auth: "Student API key", description: "Create multimodal embeddings through Vertex AI via APIM." },
  { id: "access", category: "other", name: "Authentication", method: "GET", path: "/api/access", auth: "Dashboard session", description: "Read the services and endpoints assigned to this student." },
  { id: "resources", category: "other", name: "Storage", method: "GET / POST", path: "/api/resources", auth: "Dashboard session", description: "List and upload your private learning resources." },
  { id: "activity", category: "other", name: "Database", method: "GET", path: "/api/activity", auth: "Dashboard session", description: "View calls and credit usage recorded for your account." },
  { id: "apim-test", category: "other", name: "Gateway health check", method: "GET", path: "/api/apim-test", auth: "Dashboard session", description: "Test whether the configured APIM gateway is reachable." }
];

function vertexEndpoint(item) {
  const operation = item.kind === "video" ? "predictLongRunning" : item.kind === "embeddings" ? "embedContent" : "generate";
  const category = item.kind === "video" ? "video" : item.kind === "image" ? "image" : item.kind === "chat" ? "generative" : "other";
  return { id: `vertex-${item.id}`, category, name: `Vertex ${item.name}`, model: item.id, method: "POST", path: `/api/proxy/vertex?model=${item.id}&operation=${operation}`, auth: "Student API key", description: `${item.description} through the APIM gateway.` };
}

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

function codexUnlocked(user) {
  return new Date(user.codexAccessUntil || 0).getTime() > Date.now();
}

export async function GET() {
  const user = await getUser(sessionId());
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const unlocked = codexUnlocked(user);
  const dynamicVertexEndpoints = marketplaceItems().filter((item) => item.category === "Vertex AI" && item.kind !== "tools").map(vertexEndpoint);
  const allEndpoints = [...endpoints, ...dynamicVertexEndpoints].filter((endpoint, index, list) => list.findIndex((candidate) => candidate.model && candidate.model === endpoint.model) === index || !endpoint.model);
  return Response.json({ services, endpoints: allEndpoints.filter((endpoint) => !endpoint.model || hasMarketplaceAccess(user, endpoint.model)).map((endpoint) => ({ ...endpoint, creditCost: endpoint.id === "apim-test" ? creditCost("apim-test") : endpoint.model ? creditCost(endpoint.category === "image" ? "images" : endpoint.category === "video" ? "videos" : endpoint.id.startsWith("vertex-") ? "vertex" : endpoint.id.startsWith("sarvam-") ? "sarvam" : endpoint.id.startsWith("claude-") ? "claude" : "responses", endpoint.model) : 0 })), apiKeyPrefix: unlocked ? user.apiKeyPrefix || null : null, apiKeyLocked: !unlocked, apiEndpoint: "/api/proxy/responses" });
}

export async function POST(request) {
  const user = await getUser(sessionId());
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  if (!codexUnlocked(user)) return Response.json({ error: "Unlock Codex with 5 credits to access your API key." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action = body.action || "reveal";

  if (action === "reveal") {
    if (!user.apiKeyEncrypted) {
      return Response.json({ error: "Your existing key is still active but cannot be displayed. Use Rotate API key only if you need a new key." }, { status: 409 });
    }
    try {
      const apiKey = decryptApiKey(user.apiKeyEncrypted);
      const digest = crypto.createHash("sha256").update(apiKey).digest("hex");
      if (digest !== user.apiKeyHash) throw new Error("Stored API key does not match its hash.");
      return Response.json({ apiKey, apiKeyPrefix: user.apiKeyPrefix });
    } catch {
      return Response.json({ error: "Your existing key is still active but cannot be displayed. Use Rotate API key only if you need a new key." }, { status: 409 });
    }
  }

  if (action !== "rotate") return Response.json({ error: "Unsupported API key action." }, { status: 400 });

  const apiKey = createStudentApiKey();
  user.apiKeyHash = apiKey.hash;
  user.apiKeyPrefix = apiKey.prefix;
  user.apiKeyEncrypted = apiKey.encrypted;
  user.updatedAt = new Date().toISOString();
  await saveUser(user);
  return Response.json({ apiKey: apiKey.key, apiKeyPrefix: apiKey.prefix });
}
