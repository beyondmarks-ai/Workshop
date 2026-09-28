import crypto from "node:crypto";
import { processPendingRefunds } from "../../../../lib/refunds";

export const runtime = "nodejs";

function authorized(request) {
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || request.headers.get("x-refund-secret") || "";
  const expected = process.env.REFUND_JOB_SECRET || "";
  return supplied.length === expected.length && supplied.length > 20 && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized refund worker." }, { status: 401 });
  try {
    return Response.json(await processPendingRefunds());
  } catch (error) {
    return Response.json({ error: error.message || "Refund processing failed." }, { status: 500 });
  }
}
