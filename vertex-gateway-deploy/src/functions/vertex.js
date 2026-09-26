import { app } from "@azure/functions";
import { ManagedIdentityCredential } from "@azure/identity";

const credential = new ManagedIdentityCredential();
const project = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || "us-central1";
const audience = process.env.GCP_WIF_AUDIENCE;
const serviceAccount = process.env.GCP_SERVICE_ACCOUNT;

async function googleToken() {
  const azure = await credential.getToken("api://AzureADTokenExchange/.default");
  const exchange = await fetch("https://sts.googleapis.com/v1/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", audience, scope: "https://www.googleapis.com/auth/cloud-platform", requested_token_type: "urn:ietf:params:oauth:token-type:access_token", subject_token_type: "urn:ietf:params:oauth:token-type:jwt", subject_token: azure.token }) });
  const exchanged = await exchange.json();
  if (!exchange.ok) throw new Error("Google identity exchange failed.");
  const impersonate = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`, { method: "POST", headers: { authorization: `Bearer ${exchanged.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ scope: ["https://www.googleapis.com/auth/cloud-platform"], lifetime: "3600s" }) });
  const token = await impersonate.json();
  if (!impersonate.ok) throw new Error("Google service identity exchange failed.");
  return token.accessToken;
}

async function callVertex(path, method, body) {
  const token = await googleToken();
  const response = await fetch(`https://${location}-aiplatform.googleapis.com/v1/${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-goog-user-project": project }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, contentType: response.headers.get("content-type") || "application/json", body: await response.text() };
}

function result(vertex) {
  return { status: vertex.status, headers: { "content-type": vertex.contentType }, body: vertex.body };
}

async function modelRequest(request, operation) {
  const model = request.params.model;
  if (!/^[a-z0-9.-]+$/.test(model)) return { status: 400, jsonBody: { error: "Invalid model." } };
  try {
    const suffix = operation === "generate" ? ":generateContent" : operation === "predict" ? ":predict" : operation === "predictLongRunning" ? ":predictLongRunning" : ":embedContent";
    return result(await callVertex(`projects/${project}/locations/${location}/publishers/google/models/${model}${suffix}`, "POST", JSON.parse(await request.text())));
  } catch (error) {
    return { status: 502, jsonBody: { error: error.message || "Vertex request failed." } };
  }
}

for (const operation of ["generate", "predict", "predictLongRunning", "embedContent"]) {
  app.http(`vertex-${operation}`, { methods: ["POST"], authLevel: "function", route: `vertex/${operation}/{model}`, handler: (request) => modelRequest(request, operation) });
}

app.http("vertex-poll", { methods: ["GET"], authLevel: "function", route: "vertex/operation", handler: async (request) => {
  const name = new URL(request.url).searchParams.get("name");
  if (!name || !name.startsWith("projects/")) return { status: 400, jsonBody: { error: "A valid operation name is required." } };
  try { return result(await callVertex(name, "GET")); } catch (error) { return { status: 502, jsonBody: { error: error.message || "Could not poll Vertex operation." } }; }
} });

app.http("vertex-legacy", { methods: ["POST"], authLevel: "function", route: "vertex/{model}", handler: (request) => modelRequest(request, "generate") });
