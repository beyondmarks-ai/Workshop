import crypto from "node:crypto";
import { saveActivity, updateActivity } from "./activity";
import { consumeCredit, refundCredit } from "./storage";

const clean = (value, length = 500) => String(value || "").replace(/\s+/g, " ").trim().slice(0, length);

function requestSummary(request = {}) {
  const summary = {};
  for (const key of ["model", "operation", "service"]) if (request[key] !== undefined) summary[key] = clean(request[key], 120);
  if (request.prompt !== undefined) summary.prompt = clean(request.prompt, 500);
  if (request.input !== undefined) {
    try { summary.inputPreview = clean(JSON.stringify(request.input), 1000); } catch { summary.inputPreview = "Input could not be summarized."; }
  }
  return summary;
}

export async function startUsageCharge(userId, amount, details) {
  const credit = await consumeCredit(userId, amount);
  if (!credit.allowed) return credit;
  const activityId = crypto.randomUUID();
  const model = clean(details.model || details.action || details.service, 120);
  try {
    await saveActivity({
      id: activityId,
      studentId: userId,
      service: details.service,
      action: details.action,
      model,
      status: "processing",
      creditsUsed: Number(amount),
      balance: credit.credits,
      refundStatus: "pending",
      request: requestSummary(details.request),
      note: `Deducted ${amount} credits for ${model}. The request is being processed.`
    });
  } catch (error) {
    await refundCredit(userId, amount, activityId, `${amount} credits were returned because the request could not be safely recorded.`);
    throw error;
  }
  return { ...credit, activityId, amount: Number(amount), model, service: details.service };
}

export async function finishUsageCharge(charge, result) {
  if (!charge?.activityId) return;
  const successful = Number(result.httpStatus) >= 200 && Number(result.httpStatus) < 300;
  const reason = clean(result.error || (successful ? "" : `Upstream service returned HTTP ${result.httpStatus}.`));
  await updateActivity(charge.activityId, result.studentId, {
    status: successful ? "completed" : "failed",
    httpStatus: Number(result.httpStatus) || 502,
    refundStatus: successful ? "not-required" : "pending",
    completedAt: new Date().toISOString(),
    response: clean(result.response, 12000),
    errorMessage: reason || undefined,
    note: successful
      ? `Deducted ${charge.amount} credits for a successful ${charge.model} request.`
      : `Deducted ${charge.amount} credits for ${charge.model}, but the request failed${reason ? `: ${reason}` : "."} Automatic refund is pending.`
  });
}
