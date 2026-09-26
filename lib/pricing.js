const prices = {
  responses: { "gpt-4.1": 1, "gpt-5.6-luna": 1.5 },
  images: { "gpt-image-2": 0.5, "gpt-image-2.5-flare": 0.75 },
  videos: { "sora-2": 5 },
  "apim-test": { default: 0.2 }
};

export function creditCost(service, model) {
  return prices[service]?.[model] ?? prices[service]?.default ?? 1;
}

