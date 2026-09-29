import { getUserByApiKey, isVerifiedUser } from "../../../../lib/storage";
import { hasMarketplaceAccess } from "../../../../lib/marketplace";

export const runtime = "nodejs";

const codexModels = ["gpt-4.1", "gpt-6-astra", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"];

function suppliedKey(request) {
  const bearer = request.headers.get("authorization") || "";
  return request.headers.get("x-api-key") || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
}

export async function GET(request) {
  const user = await getUserByApiKey(suppliedKey(request));
  if (!user) return Response.json({ error: "Invalid student API key." }, { status: 401 });
  if (!isVerifiedUser(user)) return Response.json({ error: "Your account is waiting for admin verification." }, { status: 403 });

  return Response.json({
    valid: true,
    student: { id: user.id, name: user.name },
    models: codexModels.filter((model) => hasMarketplaceAccess(user, model)),
  });
}
