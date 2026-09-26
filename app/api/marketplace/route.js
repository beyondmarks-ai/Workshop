import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser, isVerifiedUser, saveUser } from "../../../lib/storage";
import { marketplaceCatalog, marketplaceItems } from "../../../lib/marketplace";
import { saveActivity } from "../../../lib/activity";

export const runtime = "nodejs";

async function sessionUser() {
  try {
    const [payload, signature] = cookies().get("astra_session")?.value.split(".") || [];
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.expires > Date.now() ? await getUser(session.id) : null;
  } catch { return null; }
}

export async function GET() {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  return Response.json({ catalog: marketplaceCatalog, purchases: user.marketplacePurchases || [] });
}

export async function POST(request) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ids = [...new Set(Array.isArray(body.itemIds) ? body.itemIds.map(String) : [])];
  const items = marketplaceItems().filter((item) => ids.includes(item.id));
  const ownedIds = new Set((user.marketplacePurchases || []).map((purchase) => purchase.itemId));
  const total = items.reduce((sum, item) => sum + item.credits, 0);
  const credits = Number.isFinite(Number(user.credits)) ? Number(user.credits) : 0;
  if (!items.length || items.length !== ids.length) return Response.json({ error: "Select valid marketplace items." }, { status: 400 });
  if (items.some((item) => ownedIds.has(item.id))) return Response.json({ error: "One or more selected models are already bought." }, { status: 409 });
  if (credits < total) return Response.json({ error: `You need ${total} credits for this cart.`, credits }, { status: 402 });
  user.credits = Math.round((credits - total) * 100) / 100;
  user.marketplacePurchases = [...(user.marketplacePurchases || []), ...items.map((item) => ({ id: crypto.randomUUID(), itemId: item.id, name: item.name, category: item.category, credits: item.credits, purchasedAt: new Date().toISOString() }))];
  user.updatedAt = new Date().toISOString();
  await saveUser(user);
  await saveActivity({ studentId: user.id, service: "marketplace", action: "marketplace-purchase", status: "completed", creditsUsed: total, balance: user.credits, note: `Purchased ${items.map((item) => item.name).join(", ")}` });
  return Response.json({ credits: user.credits, purchases: user.marketplacePurchases });
}
