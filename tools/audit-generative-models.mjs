import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { marketplaceItems } from "../lib/marketplace.js";
import { creditCost } from "../lib/pricing.js";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const { BlobServiceClient } = require("@azure/storage-blob");
const { CosmosClient } = require("@azure/cosmos");

loadEnvConfig(process.cwd());

const baseUrl = process.env.GENERATIVE_AUDIT_BASE_URL || "https://dashboard.beyondmarks.ai";
const reportPath = "C:/Workshop/generative-model-audit-report.json";
const giftModels = new Set(["gpt-4.1", "gpt-5.6-luna"]);
const models = marketplaceItems().filter((item) => item.kind === "chat").map((item) => ({
  ...item,
  provider: item.category === "OpenAI" ? "openai" : item.category === "Claude" ? "claude" : "vertex",
  usage: creditCost(item.category === "OpenAI" ? "responses" : item.category === "Claude" ? "claude" : "vertex", item.id),
}));

const now = () => new Date().toISOString();

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function errorMessage(payload, fallback = "Unknown response") {
  return payload?.error?.message || payload?.error || payload?.message || fallback;
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(options.timeoutMs || 120000) });
  const text = await response.text();
  return { status: response.status, ok: response.ok, headers: Object.fromEntries(response.headers.entries()), text, json: safeJson(text) };
}

async function storageService() {
  const gatewayBase = String(process.env.ASTRA_FUNCTION_URL || "").replace(/\/$/, "");
  if (!gatewayBase || !process.env.ASTRA_FUNCTION_KEY) throw new Error("Storage gateway configuration is unavailable.");
  const response = await fetch(`${gatewayBase}/api/storage-sas`, { headers: { "x-functions-key": process.env.ASTRA_FUNCTION_KEY } });
  if (!response.ok) throw new Error(`Storage authorization failed with HTTP ${response.status}.`);
  const { account, sas } = await response.json();
  return new BlobServiceClient(`https://${account}.blob.core.windows.net?${sas}`);
}

async function updateStudent(service, studentId, changes) {
  const blob = service.getContainerClient("users").getBlockBlobClient(`${studentId}.json`);
  const user = JSON.parse((await blob.downloadToBuffer()).toString("utf8"));
  Object.assign(user, changes, { updatedAt: now() });
  await blob.uploadData(Buffer.from(JSON.stringify(user)), { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}

async function cleanup(service, studentId) {
  await service.getContainerClient("users").deleteBlob(`${studentId}.json`, { deleteSnapshots: "include" }).catch(() => {});
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) return;
  const cosmos = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
  const container = cosmos.database(process.env.COSMOS_DATABASE || "academy").container(process.env.COSMOS_CONTAINER || "activity");
  const { resources } = await container.items.query({ query: "SELECT c.id FROM c WHERE c.studentId = @studentId", parameters: [{ name: "@studentId", value: studentId }] }, { partitionKey: studentId }).fetchAll();
  for (const item of resources) await container.item(item.id, studentId).delete().catch(() => {});
}

async function profile(cookie) {
  return (await request("/api/auth", { headers: { cookie } })).json?.user || null;
}

function requestFor(model, apiKey) {
  const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  if (model.provider === "openai") {
    return request(`/api/proxy/responses?model=${encodeURIComponent(model.id)}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: "Reply with exactly OK.", max_output_tokens: 16, tools: [] }),
    });
  }
  if (model.provider === "claude") {
    return request(`/api/proxy/claude?model=${encodeURIComponent(model.id)}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [{ role: "user", content: "Reply with exactly OK." }], max_tokens: 16 }),
    });
  }
  return request(`/api/proxy/vertex?model=${encodeURIComponent(model.id)}&operation=generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with exactly OK." }] }], generationConfig: { maxOutputTokens: 16 } }),
  });
}

const report = { startedAt: now(), baseUrl, account: {}, marketplace: {}, endpointCatalog: {}, models: [], cleanup: "pending" };
let storage;
let studentId;

try {
  const unique = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
  const email = `generative-audit-${unique}@example.com`;
  const password = crypto.randomBytes(18).toString("base64url");
  const signup = await request("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "signup", email, contactNumber: `91${unique.slice(-10)}`, password, name: "Generative Audit Student", branch: "QA", semester: "1", usn: `GEN${unique.slice(-9)}` }),
  });
  if (signup.status !== 201 || !signup.json?.apiKey || !signup.json?.user?.id) throw new Error(`Signup failed: HTTP ${signup.status} ${errorMessage(signup.json, signup.text)}`);
  studentId = signup.json.user.id;
  const apiKey = signup.json.apiKey;
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is unavailable.");
  const payload = Buffer.from(JSON.stringify({ id: studentId, expires: Date.now() + 3600000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
  const cookie = `astra_session=${payload}.${signature}`;
  report.account = { signupStatus: signup.status, studentId, email, keyIssued: true, verified: true };

  storage = await storageService();
  await updateStudent(storage, studentId, { verified: true, verifiedAt: now(), credits: 2000 });
  console.log(`[${now()}] Isolated student created and verified.`);

  const gated = await request("/api/proxy/responses?model=gpt-6-astra", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ input: "Do not run", max_output_tokens: 16 }) });
  report.marketplace.prePurchaseGate = { status: gated.status, blocked: gated.status === 403 };
  if (gated.status !== 403) throw new Error(`Pre-purchase gate failed with HTTP ${gated.status}.`);

  const paidModels = models.filter((model) => !giftModels.has(model.id));
  const purchase = await request("/api/marketplace", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ itemIds: paidModels.map((model) => model.id) }) });
  if (!purchase.ok) throw new Error(`Marketplace purchase failed: HTTP ${purchase.status} ${errorMessage(purchase.json, purchase.text)}`);
  report.marketplace = { ...report.marketplace, purchaseStatus: purchase.status, paidModelsPurchased: paidModels.length, balanceAfterPurchase: purchase.json?.credits };

  const access = await request("/api/access", { headers: { cookie } });
  report.endpointCatalog = { status: access.status, costs: Object.fromEntries((access.json?.endpoints || []).filter((endpoint) => models.some((model) => model.id === endpoint.model)).map((endpoint) => [endpoint.model, endpoint.creditCost])) };

  for (const model of models) {
    console.log(`[${now()}] Testing ${model.id}...`);
    const before = await profile(cookie);
    const response = await requestFor(model, apiKey);
    const after = await profile(cookie);
    const result = {
      model: model.id,
      provider: model.provider,
      status: response.status,
      outcome: response.ok ? "working" : "failed",
      responseIsJson: Boolean(response.json),
      responseBytes: Buffer.byteLength(response.text),
      expectedUsageCredits: model.usage,
      balanceBefore: before?.credits,
      balanceAfter: after?.credits,
      observedCreditChange: Number.isFinite(before?.credits) && Number.isFinite(after?.credits) ? Math.round((before.credits - after.credits) * 100) / 100 : null,
      error: response.ok ? null : errorMessage(response.json, response.text.slice(0, 500)),
    };
    report.models.push(result);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[${now()}] ${model.id}: HTTP ${result.status}, ${result.outcome}, credit change ${result.observedCreditChange}`);
  }
} catch (error) {
  report.fatalError = error.message;
  console.error(`[${now()}] Audit error: ${error.message}`);
  process.exitCode = 1;
} finally {
  report.finishedAt = now();
  if (storage && studentId) await cleanup(storage, studentId).then(() => { report.cleanup = "completed"; }).catch((error) => { report.cleanup = `failed: ${error.message}`; });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[${now()}] Report written. Test-data cleanup: ${report.cleanup}.`);
}
