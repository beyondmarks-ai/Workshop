const academyGoogleGroups = [
  {
    kind: "maps",
    services: [
      ["maps-javascript", "Maps JavaScript API", "Interactive maps for websites"],
      ["maps-android", "Maps SDK for Android", "Native maps for Android apps"],
      ["maps-ios", "Maps SDK for iOS", "Native maps for iPhone and iPad"],
      ["places", "Places API", "Place search, details, and autocomplete"],
      ["geocoding", "Geocoding API", "Convert addresses and coordinates"],
      ["routes", "Routes API", "Directions and route optimization"],
      ["roads", "Roads API", "Match GPS points to roads"],
      ["street-view", "Street View API", "Street-level imagery"],
      ["address-validation", "Address Validation API", "Validate and standardize addresses"],
      ["geolocation", "Geolocation API", "Estimate device location"],
    ],
  },
  {
    kind: "youtube",
    services: [
      ["youtube-data", "YouTube Data API", "Videos, channels, playlists, and comments"],
      ["youtube-analytics", "YouTube Analytics API", "Channel and content analytics"],
      ["youtube-reporting", "YouTube Reporting API", "Bulk reporting data"],
      ["youtube-live", "YouTube Live Streaming API", "Manage live broadcasts and streams"],
    ],
  },
  {
    kind: "cloud-ai",
    services: [
      ["vertex-ai", "Vertex AI", "Build and deploy machine-learning applications"],
      ["gemini-api", "Gemini API", "Multimodal generative AI"],
      ["cloud-vision", "Cloud Vision API", "Image analysis and OCR"],
      ["speech-to-text", "Speech-to-Text API", "Convert speech into text"],
      ["text-to-speech", "Text-to-Speech API", "Generate natural speech"],
      ["cloud-translation", "Cloud Translation API", "Translate text and documents"],
      ["natural-language", "Natural Language API", "Analyze text and sentiment"],
      ["video-intelligence", "Video Intelligence API", "Analyze video content"],
      ["document-ai", "Document AI", "Extract and understand document data"],
    ],
  },
  {
    kind: "data",
    services: [
      ["cloud-storage", "Cloud Storage", "Object storage for files and media"],
      ["firestore", "Cloud Firestore", "Scalable document database"],
      ["bigquery", "BigQuery", "Serverless data warehouse and analytics"],
      ["cloud-sql", "Cloud SQL", "Managed relational databases"],
      ["spanner", "Cloud Spanner", "Globally scalable relational database"],
      ["bigtable", "Cloud Bigtable", "Low-latency wide-column database"],
      ["memorystore", "Memorystore", "Managed Redis and Memcached"],
    ],
  },
  {
    kind: "compute",
    services: [
      ["compute-engine", "Compute Engine", "Virtual machines on Google Cloud"],
      ["cloud-run", "Cloud Run", "Serverless container hosting"],
      ["app-engine", "App Engine", "Managed application platform"],
      ["gke", "Google Kubernetes Engine", "Managed Kubernetes clusters"],
      ["cloud-functions", "Cloud Functions", "Event-driven serverless functions"],
      ["firebase-hosting", "Firebase Hosting", "Fast web app hosting"],
      ["firebase-app-hosting", "Firebase App Hosting", "Full-stack web app hosting"],
    ],
  },
  {
    kind: "firebase",
    services: [
      ["firebase-auth", "Firebase Authentication", "Secure user sign-in"],
      ["firebase-messaging", "Firebase Cloud Messaging", "Cross-platform push notifications"],
      ["firebase-firestore", "Firebase Firestore", "Realtime document data"],
      ["firebase-database", "Firebase Realtime Database", "Synchronized JSON database"],
      ["firebase-storage", "Firebase Storage", "User-generated file storage"],
      ["firebase-crashlytics", "Firebase Crashlytics", "App crash reporting"],
      ["firebase-remote-config", "Firebase Remote Config", "Remote feature configuration"],
      ["firebase-app-check", "Firebase App Check", "Protect backend resources"],
    ],
  },
  {
    kind: "business",
    services: [
      ["google-photos", "Google Photos Library API", "Work with user photo libraries"],
      ["custom-search", "Custom Search JSON API", "Add programmable web search"],
    ],
  },
  {
    kind: "security",
    services: [
      ["identity-platform", "Identity Platform", "Customer identity and authentication"],
      ["cloud-iam", "Cloud IAM API", "Manage access and permissions"],
      ["secret-manager", "Secret Manager", "Store and manage secrets"],
      ["cloud-kms", "Cloud KMS", "Manage encryption keys"],
      ["recaptcha-enterprise", "reCAPTCHA Enterprise", "Protect against fraud and abuse"],
    ],
  },
  {
    kind: "devops",
    services: [
      ["cloud-build", "Cloud Build", "Build and automate deployments"],
      ["artifact-registry", "Artifact Registry", "Store packages and container images"],
      ["cloud-logging", "Cloud Logging", "Centralized application logs"],
      ["cloud-monitoring", "Cloud Monitoring", "Metrics, dashboards, and alerts"],
      ["cloud-scheduler", "Cloud Scheduler", "Managed scheduled jobs"],
      ["pubsub", "Pub/Sub", "Asynchronous event messaging"],
      ["api-gateway", "API Gateway", "Secure and manage APIs"],
      ["service-usage", "Service Usage API", "Manage enabled Google APIs"],
    ],
  },
];

const academyGoogleServices = academyGoogleGroups.flatMap(({ kind, services }) =>
  services.map(([id, name, description]) => ({
    id: `google-${id}`,
    name,
    description,
    credits: 0,
    kind,
    academyOnly: true,
  })),
);

export const marketplaceCatalog = [
  {
    id: "openai",
    name: "OpenAI",
    status: "Connected",
    items: [
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
        description: "Generative text",
        credits: 10,
      },
      {
        id: "gpt-6-astra",
        name: "GPT-6 Astra",
        description: "Advanced generative text",
        credits: 35,
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        description: "Advanced generative text",
        credits: 15,
      },
      {
        id: "gpt-5.6-terra",
        name: "GPT-5.6 Terra",
        description: "Reasoning and analysis",
        credits: 25,
      },
      {
        id: "gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        description: "Fast generative text",
        credits: 30,
      },
      {
        id: "gpt-image-2",
        name: "GPT Image 2",
        description: "Image generation",
        credits: 20,
      },
      {
        id: "sora-2",
        name: "Sora 2",
        description: "Video generation",
        credits: 30,
      },
    ],
  },
  {
    id: "vertex",
    name: "Vertex AI",
    status: "Key required",
    items: [
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        description: "GA reasoning and multimodal chat",
        credits: 12,
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "GA fast multimodal chat",
        credits: 6,
      },
      {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash-Lite",
        description: "GA low-cost chat",
        credits: 3,
      },
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        description: "GA fast generation",
        credits: 7,
      },
      {
        id: "gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash-Lite",
        description: "GA efficient automation",
        credits: 4,
      },
      {
        id: "gemini-3.6-flash",
        name: "Gemini 3.6 Flash",
        description: "GA long-horizon workflows",
        credits: 8,
      },
      {
        id: "gemini-3.7-flash",
        name: "Gemini 3.7 Flash",
        description: "GA coding and agentic tasks",
        credits: 9,
      },
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        description: "GA latest fast generation",
        credits: 10,
      },
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        description: "Preview complex coding and logic",
        credits: 16,
      },
      {
        id: "gemini-2.5-computer-use",
        name: "Gemini 2.5 Computer Use",
        description: "Preview computer interaction",
        credits: 14,
      },
      {
        id: "gemini-live-2.5-flash-native-audio",
        name: "Gemini Live Native Audio",
        description: "GA real-time audio conversation",
        credits: 12,
      },
      {
        id: "gemini-3.5-live-translate",
        name: "Gemini Live Translate",
        description: "Preview real-time speech translation",
        credits: 12,
      },
      {
        id: "gemini-2.5-flash-tts",
        name: "Gemini 2.5 Flash TTS",
        description: "GA text to speech",
        credits: 8,
      },
      {
        id: "gemini-2.5-pro-tts",
        name: "Gemini 2.5 Pro TTS",
        description: "GA expressive text to speech",
        credits: 10,
      },
      {
        id: "gemini-2.5-flash-image",
        name: "Gemini 2.5 Flash Image",
        description: "GA image generation",
        credits: 8,
      },
      {
        id: "gemini-3.1-flash-image",
        name: "Gemini 3.1 Flash Image",
        description: "GA fast image generation",
        credits: 10,
      },
      {
        id: "gemini-3.1-flash-lite-image",
        name: "Gemini 3.1 Flash-Lite Image",
        description: "GA efficient image generation",
        credits: 5,
      },
      {
        id: "gemini-3-pro-image",
        name: "Gemini 3 Pro Image",
        description: "GA professional image generation",
        credits: 14,
      },
      {
        id: "veo-3.1-generate-001",
        name: "Veo 3.1",
        description: "GA latest cinematic video",
        credits: 35,
      },
      {
        id: "veo-3.1-fast-generate-001",
        name: "Veo 3.1 Fast",
        description: "GA fast cinematic video",
        credits: 28,
      },
      {
        id: "veo-3.1-lite-generate-001",
        name: "Veo 3.1 Lite",
        description: "Preview efficient video",
        credits: 20,
      },
      {
        id: "gemini-embedding-001",
        name: "Gemini Embedding",
        description: "GA text embeddings",
        credits: 2,
      },
      {
        id: "gemini-embedding-2",
        name: "Gemini Embedding 2",
        description: "GA multimodal embeddings",
        credits: 3,
      },
      {
        id: "gemini-robotics-er-2-preview-info",
        name: "Gemini Robotics ER 2",
        description: "Private Preview spatial reasoning",
        credits: 18,
      },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        description: "Preview fast multimodal generation",
        credits: 8,
      },
      {
        id: "gemini-3.1-flash-image-preview",
        name: "Gemini 3.1 Flash Image Preview",
        description: "Preview image generation",
        credits: 8,
      },
      {
        id: "gemini-3.1-flash-tts-preview",
        name: "Gemini 3.1 Flash TTS",
        description: "Preview text to speech",
        credits: 8,
      },
      {
        id: "gemini-3.5-transcribe-preview",
        name: "Gemini 3.5 Transcribe",
        description: "Preview speech to text",
        credits: 8,
      },
      {
        id: "gemini-3.5-transcribe-live-preview",
        name: "Gemini 3.5 Live Transcribe",
        description: "Preview live transcription",
        credits: 10,
      },
      {
        id: "multimodalembedding",
        name: "Multimodal Embedding",
        description: "GA text, image, video, and audio embeddings",
        credits: 3,
      },
      {
        id: "text-embedding-005",
        name: "Text Embedding 005",
        description: "GA text embeddings",
        credits: 2,
      },
      {
        id: "text-multilingual-embedding-002",
        name: "Multilingual Text Embedding",
        description: "GA multilingual embeddings",
        credits: 2,
      },
    ],
  },
  {
    id: "claude",
    name: "Claude",
    status: "Connected",
    items: [
      {
        id: "claude-sonnet",
        name: "Claude Sonnet 5",
        description: "Balanced reasoning through Azure AI Foundry",
        credits: 45,
      },
    ],
  },
  {
    id: "sarvam",
    name: "Sarvam AI",
    status: "Connected",
    items: [
      {
        id: "sarvam-bulbul-v3",
        name: "Bulbul v3 Voices",
        description: "38 Indic text-to-speech voices",
        credits: 8,
      },
      {
        id: "sarvam-saaras-v3",
        name: "Saaras v3 Speech to Text",
        description: "Indic audio transcription",
        credits: 8,
      },
      {
        id: "sarvam-translate-v1",
        name: "Sarvam Translate",
        description: "Indian language translation",
        credits: 5,
      },
    ],
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    status: "Key required",
    items: [
      {
        id: "firecrawl-scrape",
        name: "Scrape",
        description: "Extract one page",
        credits: 4,
      },
      {
        id: "firecrawl-crawl",
        name: "Crawl",
        description: "Crawl a website",
        credits: 12,
      },
      {
        id: "firecrawl-map",
        name: "Map",
        description: "Map site URLs",
        credits: 5,
      },
      {
        id: "firecrawl-search",
        name: "Search",
        description: "Web search",
        credits: 6,
      },
    ],
  },
  {
    id: "google-cloud-academy",
    name: "Google Cloud",
    status: "Academy only",
    academyOnly: true,
    items: academyGoogleServices,
  },
];

export function marketplaceItems() {
  return marketplaceCatalog.flatMap((category) =>
    category.items.map((item) => ({
      ...item,
      category: category.name,
      kind: item.kind || marketplaceKind(item.id, category.id),
    })),
  );
}

export const starterPackModels = new Set(["gpt-4.1", "gpt-5.6-luna"]);

export function isStarterPackModel(itemId) {
  return starterPackModels.has(itemId);
}

export function hasMarketplaceAccess(user, itemId) {
  return (
    user?.role === "admin" ||
    isStarterPackModel(itemId) ||
    (user?.marketplacePurchases || []).some(
      (purchase) => purchase.itemId === itemId,
    )
  );
}

function marketplaceKind(id, provider) {
  if (/image|imagen|gpt-image/.test(id)) return "image";
  if (/veo|sora|video/.test(id)) return "video";
  if (
    /tts|transcrib|audio|saaras|bulbul|voice|translate|call-analytics/.test(id)
  )
    return "audio";
  if (/embedding|gecko/.test(id)) return "embeddings";
  if (
    provider === "firecrawl" ||
    /ocr|robotics|computer-use|codex|learning/.test(id)
  )
    return "tools";
  return "chat";
}
