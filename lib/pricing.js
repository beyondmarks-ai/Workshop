const prices = {
  responses: { "gpt-4.1": 1, "gpt-6-astra": 2, "gpt-5.6-luna": 1.5, "gpt-5.6-terra": 1.75, "gpt-5.6-sol": 1.25 },
  images: { "gpt-image-2": 0.5, "gpt-image-2.5-flare": 0.75 },
  videos: { "sora-2": 5 },
  claude: { "claude-sonnet": 1.5, "claude-haiku": 0.75, "claude-opus": 2.5 },
  sarvam: { "sarvam-bulbul-v3": 1, "sarvam-saaras-v3": 1, "sarvam-translate-v1": 0.5 },
  vertex: { default: 0.5 },
  "apim-test": { default: 0.2 }
};

export function creditCost(service, model) {
  if (service === "vertex") {
    if (/veo/.test(model)) return 8;
    if (/image/.test(model)) return 2;
    if (/tts|transcrib|live/.test(model)) return 1;
    if (/embedding/.test(model)) return 0.2;
    if (/pro/.test(model)) return 1.5;
    if (/flash-lite/.test(model)) return 0.25;
  }
  return prices[service]?.[model] ?? prices[service]?.default ?? 1;
}

