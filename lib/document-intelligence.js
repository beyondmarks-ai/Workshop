import { gatewayFetch } from "./function-gateway";

export async function analyzePdfBuffer(data, pageNumber) {
  const pages = pageNumber ? `?pages=${pageNumber}` : "";
  const response = await gatewayFetch(`document${pages}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: data
  });
  if (!response.ok) throw new Error(`Azure layout analysis failed: ${await response.text()}`);
  return response.json();
}

export const analyzePdf = async (file, pageNumber) => analyzePdfBuffer(Buffer.from(await file.arrayBuffer()), pageNumber);
