import { app } from "@azure/functions";

app.timer("automatic-credit-refunds", {
  schedule: "0 */10 * * * *",
  handler: async (_timer, context) => {
    const url = process.env.REFUND_JOB_URL;
    const secret = process.env.REFUND_JOB_SECRET;
    if (!url || !secret) throw new Error("Refund worker settings are missing.");
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    const result = await response.text();
    if (!response.ok) throw new Error(`Refund worker returned ${response.status}: ${result.slice(0, 500)}`);
    context.log(`Automatic refund run completed: ${result.slice(0, 1000)}`);
  }
});
