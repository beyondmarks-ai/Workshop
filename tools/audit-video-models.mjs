import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const { BlobServiceClient } = require("@azure/storage-blob");
const { CosmosClient } = require("@azure/cosmos");

loadEnvConfig(process.cwd());

const baseUrl = process.env.VIDEO_AUDIT_BASE_URL || "https://dashboard.beyondmarks.ai";
const reportPath = "C:/Workshop/video-model-audit-report.json";
const pollIntervalMs = 15000;
const maxPolls = 48;
const videoModels = [
  { id: "sora-2", provider: "sora", purchase: 30, usage: 7 },
  { id: "veo-3.1-generate-001", provider: "vertex", purchase: 35, usage: 8 },
  { id: "veo-3.1-fast-generate-001", provider: "vertex", purchase: 28, usage: 10 },
  { id: "veo-3.1-lite-generate-001", provider: "vertex", purchase: 20, usage: 8 },
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const now = () => new Date().toISOString();

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function message(payload, fallback = "Unknown response") {
  return payload?.error?.message || payload?.error || payload?.message || fallback;
}

function findStrings(value, names, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) findStrings(item, names, found);
    return found;
  }
  for (const [key, item] of Object.entries(value)) {
    if (names.has(key) && typeof item === "string") found.push(item);
    else findStrings(item, names, found);
  }
  return found;
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 60000),
  });
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    json: safeJson(text),
  };
}

async function storageService() {
  const gatewayBase = String(process.env.ASTRA_FUNCTION_URL || "").replace(/\/$/, "");
  if (!gatewayBase || !process.env.ASTRA_FUNCTION_KEY) throw new Error("Storage gateway configuration is unavailable.");
  const response = await fetch(`${gatewayBase}/api/storage-sas`, {
    headers: { "x-functions-key": process.env.ASTRA_FUNCTION_KEY },
  });
  if (!response.ok) throw new Error(`Storage authorization failed with HTTP ${response.status}.`);
  const { account, sas } = await response.json();
  return new BlobServiceClient(`https://${account}.blob.core.windows.net?${sas}`);
}

async function updateTestStudent(service, studentId, changes) {
  const blob = service.getContainerClient("users").getBlockBlobClient(`${studentId}.json`);
  const user = JSON.parse((await blob.downloadToBuffer()).toString("utf8"));
  Object.assign(user, changes, { updatedAt: now() });
  const data = Buffer.from(JSON.stringify(user));
  await blob.uploadData(data, { blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } });
}

async function removeTestData(service, studentId) {
  if (!studentId) return;
  await service.getContainerClient("users").deleteBlob(`${studentId}.json`, { deleteSnapshots: "include" }).catch(() => {});
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) return;
  const cosmos = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
  const container = cosmos.database(process.env.COSMOS_DATABASE || "academy").container(process.env.COSMOS_CONTAINER || "activity");
  const { resources } = await container.items.query({
    query: "SELECT c.id FROM c WHERE c.studentId = @studentId",
    parameters: [{ name: "@studentId", value: studentId }],
  }, { partitionKey: studentId }).fetchAll();
  for (const item of resources) await container.item(item.id, studentId).delete().catch(() => {});
}

async function profile(cookie) {
  const response = await request("/api/auth", { headers: { cookie } });
  return response.json?.user || null;
}

async function inspectPlayableContent(path, apiKey) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${apiKey}`, range: "bytes=0-1023" },
    signal: AbortSignal.timeout(60000),
  });
  const reader = response.body?.getReader();
  let firstChunkBytes = 0;
  if (reader) {
    const chunk = await reader.read();
    firstChunkBytes = chunk.value?.byteLength || 0;
    await reader.cancel().catch(() => {});
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
    contentRange: response.headers.get("content-range"),
    acceptsRanges: response.headers.get("accept-ranges"),
    firstChunkBytes,
    playable: response.ok && String(response.headers.get("content-type") || "").startsWith("video/") && firstChunkBytes > 0,
  };
}

async function testSora(model, apiKey) {
  const submitted = await request(`/api/proxy/videos?model=${encodeURIComponent(model.id)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "A slow cinematic aerial view of green hills at sunrise, no people, natural colors",
      size: "1280x720",
      seconds: "4",
    }),
    timeoutMs: 120000,
  });
  const result = {
    model: model.id,
    provider: model.provider,
    submittedAt: now(),
    submitStatus: submitted.status,
    retryAfter: submitted.headers["retry-after"] || null,
    creditsAfterSubmit: submitted.headers["x-credits-remaining"] || null,
  };
  if (!submitted.ok) {
    result.outcome = "submit-failed";
    result.error = message(submitted.json, submitted.text.slice(0, 500));
    return result;
  }
  const id = submitted.json?.id || submitted.json?.video_id || submitted.json?.data?.id || submitted.json?.operation?.id;
  result.jobIdPresent = Boolean(id);
  if (!id) {
    result.outcome = "accepted-without-job-id";
    result.responseKeys = Object.keys(submitted.json || {});
    return result;
  }
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    await sleep(pollIntervalMs);
    const status = await request(`/api/proxy/videos/${encodeURIComponent(id)}?model=sora-2`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    result.polls = attempt;
    result.lastPollStatus = status.status;
    if (!status.ok) {
      result.outcome = "status-failed";
      result.error = message(status.json, status.text.slice(0, 500));
      return result;
    }
    const state = String(status.json?.status || status.json?.state || status.json?.data?.status || status.json?.data?.state || "unknown").toLowerCase();
    result.state = state;
    console.log(`[${now()}] ${model.id} poll ${attempt}: ${state}`);
    if (["failed", "cancelled", "canceled", "expired"].includes(state)) {
      result.outcome = "generation-failed";
      result.error = message(status.json, "Video job failed.");
      return result;
    }
    if (["completed", "succeeded", "success", "done"].includes(state)) {
      result.outcome = "completed";
      result.content = await inspectPlayableContent(`/api/proxy/videos/${encodeURIComponent(id)}/content?model=sora-2`, apiKey);
      return result;
    }
  }
  result.outcome = "poll-timeout";
  return result;
}

async function testVertexVideo(model, apiKey) {
  const submitted = await request(`/api/proxy/vertex?model=${encodeURIComponent(model.id)}&operation=predictLongRunning`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: "A calm ocean wave rolling onto an empty beach at sunrise, cinematic, no people" }],
      parameters: { sampleCount: 1, durationSeconds: 4, aspectRatio: "16:9", personGeneration: "dont_allow", generateAudio: false },
    }),
    timeoutMs: 120000,
  });
  const result = {
    model: model.id,
    provider: model.provider,
    submittedAt: now(),
    submitStatus: submitted.status,
    retryAfter: submitted.headers["retry-after"] || null,
    creditsAfterSubmit: submitted.headers["x-credits-remaining"] || null,
  };
  if (!submitted.ok) {
    result.outcome = "submit-failed";
    result.error = message(submitted.json, submitted.text.slice(0, 500));
    return result;
  }
  const operationName = submitted.json?.name || submitted.json?.operation?.name || submitted.json?.data?.name;
  result.operationNamePresent = Boolean(operationName);
  if (!operationName) {
    result.outcome = "accepted-without-operation-name";
    result.responseKeys = Object.keys(submitted.json || {});
    return result;
  }
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    await sleep(pollIntervalMs);
    const status = await request(`/api/proxy/vertex?name=${encodeURIComponent(operationName)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    result.polls = attempt;
    result.lastPollStatus = status.status;
    if (!status.ok) {
      result.outcome = "status-failed";
      result.error = message(status.json, status.text.slice(0, 500));
      return result;
    }
    const done = status.json?.done === true;
    const failed = Boolean(status.json?.error);
    const state = failed ? "failed" : done ? "completed" : "running";
    result.state = state;
    console.log(`[${now()}] ${model.id} poll ${attempt}: ${state}`);
    if (failed) {
      result.outcome = "generation-failed";
      result.error = message(status.json, "Vertex operation failed.");
      return result;
    }
    if (done) {
      const urls = findStrings(status.json, new Set(["uri", "url", "gcsUri", "videoUri"]));
      const base64 = findStrings(status.json, new Set(["bytesBase64Encoded", "videoBytes"]));
      result.outcome = "completed";
      result.asset = {
        urlPresent: urls.length > 0,
        urlSchemes: [...new Set(urls.map((value) => value.split(":", 1)[0]))],
        base64Present: base64.length > 0,
        dashboardPlaybackRoutePresent: false,
      };
      const content = await request(`/api/proxy/vertex/content?name=${encodeURIComponent(operationName)}`, {
        headers: { authorization: `Bearer ${apiKey}`, range: "bytes=0-4095" },
      });
      result.content = {
        status: content.status,
        contentType: content.headers["content-type"] || null,
        contentLength: content.headers["content-length"] || null,
        contentRange: content.headers["content-range"] || null,
        firstChunkBytes: Buffer.byteLength(content.text || ""),
        playable: content.status === 206 && String(content.headers["content-type"] || "").startsWith("video/"),
      };
      result.asset.dashboardPlaybackRoutePresent = result.content.playable;
      return result;
    }
  }
  result.outcome = "poll-timeout";
  return result;
}

const report = {
  startedAt: now(),
  baseUrl,
  account: {},
  marketplace: {},
  endpointCatalog: {},
  models: [],
  cleanup: "pending",
};

let studentId;
let storage;
try {
  const unique = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
  const email = `video-audit-${unique}@example.com`;
  const password = crypto.randomBytes(18).toString("base64url");
  const signup = await request("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "signup", email, contactNumber: `91${unique.slice(-10)}`, password, name: "Video Audit Student", branch: "QA", semester: "1", usn: `AUDIT${unique.slice(-8)}` }),
  });
  if (signup.status !== 201 || !signup.json?.apiKey || !signup.json?.user?.id) throw new Error(`Test signup failed: HTTP ${signup.status} ${message(signup.json, signup.text)}`);
  studentId = signup.json.user.id;
  const apiKey = signup.json.apiKey;
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is unavailable for the isolated test session.");
  const sessionPayload = Buffer.from(JSON.stringify({ id: studentId, expires: Date.now() + 3600000 })).toString("base64url");
  const sessionSignature = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(sessionPayload).digest("base64url");
  const cookie = `astra_session=${sessionPayload}.${sessionSignature}`;
  report.account = { signupStatus: signup.status, studentId, email, keyIssued: true, isolatedSessionCreated: true };
  console.log(`[${now()}] Test student created and API key issued.`);

  storage = await storageService();
  await updateTestStudent(storage, studentId, { verified: true, verifiedAt: now(), credits: 1000 });
  report.account.verified = true;

  const gateCheck = await request("/api/proxy/videos?model=sora-2", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt: "Access-control test only", size: "1280x720", seconds: "4" }),
  });
  report.marketplace.prePurchaseGate = { status: gateCheck.status, blocked: gateCheck.status === 403, message: message(gateCheck.json, gateCheck.text.slice(0, 200)) };
  if (gateCheck.status !== 403) throw new Error(`Sora pre-purchase gate failed with HTTP ${gateCheck.status}; audit stopped to avoid an unintended job.`);

  const purchase = await request("/api/marketplace", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ itemIds: videoModels.map((model) => model.id) }),
  });
  if (!purchase.ok) throw new Error(`Marketplace purchase failed: HTTP ${purchase.status} ${message(purchase.json, purchase.text)}`);
  report.marketplace.purchaseStatus = purchase.status;
  report.marketplace.modelsPurchased = videoModels.length;
  report.marketplace.balanceAfterPurchase = purchase.json?.credits;
  console.log(`[${now()}] Purchased ${videoModels.length} video models for the test student.`);

  const access = await request("/api/access", { headers: { cookie } });
  const endpointCosts = Object.fromEntries((access.json?.endpoints || []).filter((endpoint) => videoModels.some((model) => model.id === endpoint.model)).map((endpoint) => [endpoint.model, endpoint.creditCost]));
  report.endpointCatalog = { status: access.status, costs: endpointCosts };

  for (const model of videoModels) {
    console.log(`[${now()}] Testing ${model.id}...`);
    const before = await profile(cookie);
    const result = model.provider === "sora" ? await testSora(model, apiKey) : await testVertexVideo(model, apiKey);
    const after = await profile(cookie);
    result.expectedUsageCredits = model.usage;
    result.balanceBefore = before?.credits;
    result.balanceAfter = after?.credits;
    result.observedCreditChange = Number.isFinite(before?.credits) && Number.isFinite(after?.credits) ? Math.round((before.credits - after.credits) * 100) / 100 : null;
    report.models.push(result);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[${now()}] ${model.id}: ${result.outcome}, HTTP ${result.submitStatus}, credit change ${result.observedCreditChange}`);
  }
} catch (error) {
  report.fatalError = error.message;
  console.error(`[${now()}] Audit error: ${error.message}`);
  process.exitCode = 1;
} finally {
  report.finishedAt = now();
  if (storage && studentId) {
    await removeTestData(storage, studentId).then(() => { report.cleanup = "completed"; }).catch((error) => { report.cleanup = `failed: ${error.message}`; });
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[${now()}] Report written. Test-data cleanup: ${report.cleanup}.`);
}
