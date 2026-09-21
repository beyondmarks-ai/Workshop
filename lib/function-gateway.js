const baseUrl = process.env.ASTRA_FUNCTION_URL?.replace(/\/$/, "");

export function gatewayFetch(path, options = {}) {
  if (!baseUrl || !process.env.ASTRA_FUNCTION_KEY) throw new Error("Astra Function gateway is not configured.");
  return fetch(`${baseUrl}/api/${path}`, {
    ...options,
    headers: { ...options.headers, "x-functions-key": process.env.ASTRA_FUNCTION_KEY }
  });
}
