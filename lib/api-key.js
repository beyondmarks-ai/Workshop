import crypto from "node:crypto";

function encryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("API key encryption is not configured.");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptApiKey(apiKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptApiKey(value) {
  const [version, ivValue, tagValue, encryptedValue] = String(value || "").split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Stored API key cannot be decrypted.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function createStudentApiKey() {
  const key = `bma_${crypto.randomBytes(32).toString("base64url")}`;
  return {
    key,
    hash: crypto.createHash("sha256").update(key).digest("hex"),
    prefix: key.slice(0, 12),
    encrypted: encryptApiKey(key)
  };
}
