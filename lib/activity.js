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
