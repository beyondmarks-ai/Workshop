const prices = {
  responses: { "gpt-4.1": 0.5, "gpt-6-astra": 4, "gpt-5.6-luna": 1, "gpt-5.6-terra": 2.5, "gpt-5.6-sol": 3 },
  images: { "gpt-image-2": 3, "gpt-image-2.5-flare": 0.75 },
  videos: { "sora-2": 7 },
  claude: { "claude-sonnet": 5, "claude-haiku": 3, "claude-opus": 2.5 },
  sarvam: { "sarvam-bulbul-v3": 1, "sarvam-saaras-v3": 1, "sarvam-translate-v1": 0.5 },
  vertex: {
    "gemini-2.5-flash-image": 2,
    "gemini-3.1-flash-image": 3,
    "gemini-3.1-flash-lite-image": 2,
    "gemini-3-pro-image": 4,
    "veo-2.0-generate-001": 8,
    "veo-3.0-generate-001": 8,
    "veo-3.0-fast-generate-001": 8,
    "veo-3.1-generate-001": 8,
    "veo-3.1-fast-generate-001": 10,
    "veo-3.1-lite-generate-001": 8,
    "gemini-omni-flash-preview": 1,
    "gemini-omni-1.1-flash-preview": 1,
    default: 0.5
  },
  "apim-test": { default: 0.2 }
};

export function creditCost(service, model) {
  if (service === "vertex") {
    if (prices.vertex[model] != null) return prices.vertex[model];
    if (/veo/.test(model)) return 8;
    if (/image/.test(model)) return 2;
    if (/tts|transcrib|live/.test(model)) return 1;
    if (/embedding/.test(model)) return 0.2;
    if (/pro/.test(model)) return 1.5;
    if (/flash-lite/.test(model)) return 0.25;
  }
  return prices[service]?.[model] ?? prices[service]?.default ?? 1;
}

