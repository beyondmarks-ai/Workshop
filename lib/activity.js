import crypto from "node:crypto";
import { CosmosClient } from "@azure/cosmos";

let container;

function activityContainer() {
  if (!container) {
    const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
    container = client.database(process.env.COSMOS_DATABASE || "academy").container(process.env.COSMOS_CONTAINER || "activity");
  }
  return container;
}

export async function saveActivity(activity) {
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) return;
  const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...activity };
  await activityContainer().items.upsert(item);
  return item;
}

export async function updateActivity(id, studentId, updates) {
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) return;
  const item = activityContainer().item(id, studentId);
  const { resource } = await item.read();
  if (!resource) throw new Error("Activity record not found.");
  const updated = { ...resource, ...updates };
  await item.replace(updated);
  return updated;
}

export async function listPendingRefunds(limit = 100) {
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) return [];
  const staleBefore = new Date(Date.now() - 30 * 60000).toISOString();
  const { resources } = await activityContainer().items.query({
    query: "SELECT TOP @limit * FROM c WHERE c.refundStatus = 'pending' AND c.creditsUsed > 0 AND (c.status = 'failed' OR (c.status = 'processing' AND c.createdAt < @staleBefore)) ORDER BY c.createdAt ASC",
    parameters: [{ name: "@limit", value: limit }, { name: "@staleBefore", value: staleBefore }]
  }, { enableCrossPartitionQuery: true }).fetchAll();
  return resources;
}

export async function listActivities() {
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) return [];
  const { resources } = await activityContainer().items.query("SELECT * FROM c ORDER BY c.createdAt DESC", { maxItemCount: 200, enableCrossPartitionQuery: true }).fetchAll();
  return resources;
}

export async function listStudentActivities(studentId) {
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) return [];
  const { resources } = await activityContainer().items.query({ query: "SELECT * FROM c WHERE c.studentId = @studentId ORDER BY c.createdAt DESC", parameters: [{ name: "@studentId", value: studentId }] }, { partitionKey: studentId, maxItemCount: 100 }).fetchAll();
  return resources;
}

export async function getStudentVideoJob(studentId, videoJobId) {
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) return null;
  const { resources } = await activityContainer().items.query({
    query: "SELECT TOP 1 * FROM c WHERE c.studentId = @studentId AND c.service = 'videos' AND (c.videoJobId = @videoJobId OR CONTAINS(c.response, @videoJobId)) ORDER BY c.createdAt DESC",
    parameters: [{ name: "@studentId", value: studentId }, { name: "@videoJobId", value: videoJobId }]
  }, { partitionKey: studentId, maxItemCount: 1 }).fetchAll();
  return resources[0] || null;
}

export async function updateVideoJobState(job, state, errorMessage) {
  if (!job?.id || !job?.studentId) return;
  const failed = ["failed", "cancelled", "canceled", "expired"].includes(String(state || "").toLowerCase());
  await updateActivity(job.id, job.studentId, {
    generationStatus: String(state || "unknown").slice(0, 80),
    ...(failed ? {
      status: "failed",
      refundStatus: job.refundStatus === "refunded" ? "refunded" : "pending",
      errorMessage: String(errorMessage || `Video generation ended with status ${state}.`).slice(0, 500),
      note: `The ${job.model || "video"} job failed after it was accepted. An automatic refund of ${job.creditsUsed} credits is pending.`
    } : {}),
    lastPolledAt: new Date().toISOString()
  });
}
