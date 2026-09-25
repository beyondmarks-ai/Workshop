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
  await activityContainer().items.upsert({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...activity });
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
