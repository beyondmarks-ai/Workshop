import { app } from "@azure/functions";
import { Readable } from "node:stream";
import { StorageSharedKeyCredential, generateAccountSASQueryParameters } from "@azure/storage-blob";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const proxy = async (url, request, headers) => {
  const response = await fetch(url, {
    method: request.method,
    headers: { "content-type": request.headers.get("content-type") || "application/json", ...headers },
    body: request.method === "GET" ? undefined : Buffer.from(await request.arrayBuffer())
  });
  return {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/octet-stream" },
    body: response.body ? Readable.fromWeb(response.body) : undefined
  };
};

app.http("openai", {
  methods: ["POST"], authLevel: "function", route: "openai",
  handler: (request) => proxy(
    `${required("AZURE_OPENAI_ENDPOINT").replace(/\/$/, "")}/openai/deployments/${required("AZURE_OPENAI_DEPLOYMENT")}/chat/completions?api-version=2024-10-21`,
    request,
    { "api-key": required("AZURE_OPENAI_API_KEY") }
  )
});

app.http("sarvam", {
  methods: ["POST"], authLevel: "function", route: "sarvam/{operation}",
  handler: (request) => {
    const operation = request.params.operation;
    const paths = { translate: "translate", tts: "text-to-speech", stt: "speech-to-text" };
    if (!paths[operation]) return { status: 404, jsonBody: { error: "Unknown Sarvam operation." } };
    return proxy(`https://api.sarvam.ai/${paths[operation]}`, request, { "api-subscription-key": required("SARVAM_API_KEY") });
  }
});

app.http("document", {
  methods: ["POST"], authLevel: "function", route: "document",
  handler: async (request) => {
    const pages = request.query.get("pages");
    const suffix = pages ? `&pages=${encodeURIComponent(pages)}` : "";
    const key = required("AZURE_DOCUMENT_INTELLIGENCE_KEY");
    const started = await fetch(`${required("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT").replace(/\/$/, "")}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30${suffix}`, {
      method: "POST", headers: { "content-type": "application/pdf", "Ocp-Apim-Subscription-Key": key }, body: Buffer.from(await request.arrayBuffer())
    });
    if (!started.ok) return { status: started.status, body: await started.text() };
    const operationUrl = started.headers.get("operation-location");
    if (!operationUrl) return { status: 502, jsonBody: { error: "Document Intelligence returned no operation URL." } };
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result = await fetch(operationUrl, { headers: { "Ocp-Apim-Subscription-Key": key } });
      const body = await result.json();
      if (body.status === "succeeded") return { jsonBody: body.analyzeResult };
      if (body.status === "failed") return { status: 502, jsonBody: { error: body.error?.message || "Document analysis failed." } };
    }
    return { status: 504, jsonBody: { error: "Document analysis timed out." } };
  }
});

app.http("storageSas", {
  methods: ["GET"], authLevel: "function", route: "storage-sas",
  handler: async () => {
    const account = required("AZURE_STORAGE_ACCOUNT_NAME");
    const expiresOn = new Date(Date.now() + 15 * 60 * 1000);
    const credential = new StorageSharedKeyCredential(account, required("AZURE_STORAGE_ACCOUNT_KEY"));
    const sas = generateAccountSASQueryParameters({
      services: "b",
      resourceTypes: "sco",
      permissions: "rwdlac",
      protocol: "https",
      startsOn: new Date(Date.now() - 60 * 1000),
      expiresOn
    }, credential).toString();
    return { jsonBody: { account, sas, expiresAt: expiresOn.toISOString() } };
  }
});
