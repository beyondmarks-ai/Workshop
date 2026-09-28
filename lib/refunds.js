import { listPendingRefunds, saveActivity, updateActivity } from "./activity";
import { refundCredit } from "./storage";

const clean = (value, length = 300) => String(value || "").replace(/\s+/g, " ").trim().slice(0, length);

export async function processPendingRefunds(limit = 100) {
  const candidates = await listPendingRefunds(limit);
  const results = [];
  for (const activity of candidates) {
    try {
      const amount = Number(activity.creditsUsed);
      const model = clean(activity.model || activity.request?.model || activity.service, 120);
      const reason = clean(activity.errorMessage || (activity.status === "processing" ? "Request did not finish within 30 minutes" : `HTTP ${activity.httpStatus || "failure"}`));
      const message = `${amount} credits were returned because your ${model} request failed${reason ? ` (${reason})` : ""}.`;
      const refund = await refundCredit(activity.studentId, amount, activity.id, message);
      if (!refund.refunded && !refund.alreadyRefunded) throw new Error(refund.reason || "Refund could not be applied.");
      const refundedAt = new Date().toISOString();
      await saveActivity({
        id: `refund-${activity.id}`,
        studentId: activity.studentId,
        service: "automatic-refund",
        action: "credit-refunded",
        status: "completed",
        creditsUsed: amount,
        balance: refund.credits,
        relatedActivityId: activity.id,
        model,
        note: `Returned ${amount} credits for the failed ${model} request. Reason: ${reason}.`
      });
      await updateActivity(activity.id, activity.studentId, { refundStatus: "refunded", refundedAt, balanceAfterRefund: refund.credits, note: `${activity.note} Refund processed: ${amount} credits returned.` });
      results.push({ id: activity.id, refunded: amount, balance: refund.credits });
    } catch (error) {
      results.push({ id: activity.id, error: error.message || "Refund failed." });
    }
  }
  return { checked: candidates.length, refunded: results.filter((item) => item.refunded).length, results };
}
