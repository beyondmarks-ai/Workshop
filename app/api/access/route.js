import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser, saveUser } from "../../../lib/storage";

export const runtime = "nodejs";

const cookieName = "astra_session";
const services = [
  { id: "ai", name: "AI learning tools", description: "Use approved AI features through the academy gateway." },
  { id: "assets", name: "Workshop resources", description: "Access permitted images, videos, and learning files." },
  { id: "profile", name: "Student profile", description: "Manage your registered account information." }
];

const endpoints = [
  { id: "responses", name: "Luna Responses", method: "POST", path: "/api/proxy/responses", auth: "Student API key", description: "Send prompts through the approved AI gateway. Uses one credit per call." },
  { id: "access", name: "Access catalog", method: "GET", path: "/api/access", auth: "Dashboard session", description: "Read the services and endpoints assigned to this student." },
  { id: "resources", name: "Student resources", method: "GET / POST", path: "/api/resources", auth: "Dashboard session", description: "List and upload your private learning resources." },
  { id: "activity", name: "Activity history", method: "GET", path: "/api/activity", auth: "Dashboard session", description: "View calls and credit usage recorded for your account." },
  { id: "apim-test", name: "Gateway health check", method: "GET", path: "/api/apim-test", auth: "Dashboard session", description: "Test whether the configured APIM gateway is reachable." }
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

export async function GET() {
  const user = await getUser(sessionId());
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  return Response.json({ services, endpoints, apiKeyPrefix: user.apiKeyPrefix || null, apiEndpoint: "/api/proxy/responses" });
}

export async function POST() {
  const user = await getUser(sessionId());
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const apiKey = newApiKey();
  user.apiKeyHash = apiKey.hash;
  user.apiKeyPrefix = apiKey.prefix;
  user.updatedAt = new Date().toISOString();
  await saveUser(user);
  return Response.json({ apiKey: apiKey.key, apiKeyPrefix: apiKey.prefix });
}
