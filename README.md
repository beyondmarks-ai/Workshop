# Astra

Astra is a multilingual learning workspace built with Next.js. Students can upload PDFs, translate one page at a time while preserving important English study terms, generate audio lessons, and speak with the open PDF page through AI Ask.

## Features

- Email or phone signup, sign-in, profile settings, and secure password hashing
- Page-level PDF translation with original and translated views
- English technical and exam keyword preservation across Indian languages
- Saved materials, grouped translations, and audio lessons
- Sarvam speech recognition and text-to-speech
- Azure OpenAI-powered AI Ask for the currently open PDF page
- Azure Blob Storage for users, documents, translations, and audio
- Azure Function gateway so provider API keys never enter the Next.js app

## Requirements

- Node.js 20 or newer
- npm
- An Azure Function App running the gateway in [`function-app`](./function-app)
- Azure Blob Storage, Azure Document Intelligence, Azure OpenAI, and Sarvam credentials configured in the Function App

## Download and run

```bash
git clone https://github.com/beyondmarks-ai/Astra.git
cd Astra
npm install
cp .env.example .env.local
```

On Windows PowerShell, replace the last command with:

```powershell
Copy-Item .env.example .env.local
```

Set these server-only values in `.env.local`:

```env
AUTH_SECRET=generate-a-long-random-value
ASTRA_FUNCTION_URL=https://your-function-app.azurewebsites.net
ASTRA_FUNCTION_KEY=your-function-host-key
```

Generate an authentication secret with Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Azure Function gateway

Permanent provider credentials belong in Azure Function App settings:

| Setting | Purpose |
| --- | --- |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI authentication |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_DEPLOYMENT` | Chat model deployment name |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | PDF layout analysis authentication |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Document Intelligence endpoint |
| `AZURE_STORAGE_ACCOUNT_NAME` | Blob Storage account name |
| `AZURE_STORAGE_ACCOUNT_KEY` | Blob Storage authentication |
| `SARVAM_API_KEY` | Translation, speech recognition, and speech generation |

Install and deploy the gateway with Azure Functions Core Tools:

```bash
cd function-app
npm install
func azure functionapp publish YOUR_FUNCTION_APP_NAME --javascript
```

Create a dedicated host key for the Next.js server:

```bash
az functionapp keys set \
  --resource-group YOUR_RESOURCE_GROUP \
  --name YOUR_FUNCTION_APP_NAME \
  --key-type functionKeys \
  --key-name astra-next \
  --key-value YOUR_RANDOM_KEY
```

Copy the Function URL and that key into `.env.local`. The gateway exposes only fixed OpenAI, Sarvam, Document Intelligence, and short-lived storage authorization operations.

## Production build

```bash
npm run build
npm start
```

The custom Node server is required for the AI Ask WebSocket connection.

## Project structure

```text
app/             Next.js pages and API routes
function-app/    Azure Function secret gateway
lib/             Storage, language, and gateway helpers
public/          Static assets and PDF.js worker
server.js        Next.js server with AI Ask WebSocket support
```

## Security

- `.env.local` and other environment files are ignored by Git.
- Provider credentials stay in encrypted Azure Function App settings.
- The Next.js server uses one revocable Function key.
- Blob access uses short-lived server-side SAS tokens; browser file requests are proxied through the application.
