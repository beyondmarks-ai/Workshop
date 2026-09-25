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
  return Response.json({ services, apiKeyPrefix: user.apiKeyPrefix || null, apiEndpoint: "/api/proxy/responses" });
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
