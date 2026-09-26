import { app } from "@azure/functions";
import { ManagedIdentityCredential } from "@azure/identity";

const credential = new ManagedIdentityCredential();
const project = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || "us-central1";
const audience = process.env.GCP_WIF_AUDIENCE;
const serviceAccount = process.env.GCP_SERVICE_ACCOUNT;

app.http("vertex", {
  methods: ["POST"],
  authLevel: "function",
  route: "vertex/{model}",
  handler: async (request, context) => {
    const model = request.params.model;
    if (!/^[a-z0-9.-]+$/.test(model)) return { status: 400, jsonBody: { error: "Invalid model." } };
    const body = await request.text();
    const azureToken = await credential.getToken("api://AzureADTokenExchange/.default");
    if (!azureToken?.token) return { status: 502, jsonBody: { error: "Azure identity token unavailable." } };

    const exchange = await fetch("https://sts.googleapis.com/v1/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        audience,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
        subject_token: azureToken.token
      })
    });
    const exchanged = await exchange.json().catch(() => ({}));
    if (!exchange.ok || !exchanged.access_token) {
      context.error("Google STS exchange failed", exchange.status, exchanged.error_description || exchanged.error);
      return { status: 502, jsonBody: { error: "Google identity exchange failed." } };
    }

    const impersonate = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`, {
      method: "POST",
      headers: { authorization: `Bearer ${exchanged.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ scope: ["https://www.googleapis.com/auth/cloud-platform"], lifetime: "3600s" })
    });
    const impersonated = await impersonate.json().catch(() => ({}));
    if (!impersonate.ok || !impersonated.accessToken) return { status: 502, jsonBody: { error: "Google service identity exchange failed." } };

    const vertex = await fetch(`https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`, {
      method: "POST",
      headers: { authorization: `Bearer ${impersonated.accessToken}`, "content-type": "application/json", "x-goog-user-project": project },
      body
    });
    return { status: vertex.status, headers: { "content-type": vertex.headers.get("content-type") || "application/json" }, body: await vertex.text() };
  }
});
