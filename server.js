const http = require("node:http");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");

const dev = !process.argv.includes("--production");
const port = Number(process.env.PORT || 3000);
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((request, response) => handle(request, response));
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 15 * 1024 * 1024 });

  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url, `http://${request.headers.host}`).pathname !== "/ai-ask-ws") return socket.destroy();
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client));
  });

  sockets.on("connection", (socket) => {
    let request = null;
    let audio = [];
    let busy = false;

    const send = (value) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(value));
    const ask = async (details, recording) => {
      if (busy) return;
      busy = true;
      try {
        const form = new FormData();
        form.set("materialId", details.materialId || "");
        form.set("pageNumber", String(details.pageNumber || 1));
        form.set("speaker", details.speaker || "shubh");
        form.set("pace", String(details.pace || 1));
        form.set("history", JSON.stringify(details.history || []));
        if (details.question) form.set("question", details.question);
        if (recording.length) form.set("audio", new Blob(recording, { type: details.mimeType || "audio/webm" }), "question.webm");
        const response = await fetch(`http://127.0.0.1:${port}/api/ask`, { method: "POST", body: form });
        if (!response.ok) throw new Error(`AI Ask server returned ${response.status}.`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop();
          lines.filter(Boolean).forEach((line) => socket.readyState === WebSocket.OPEN && socket.send(line));
        }
      } catch (error) {
        send({ type: "error", message: error.message || "AI Ask failed." });
      } finally {
        busy = false;
      }
    };

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        if (!request || busy) return;
        audio.push(data);
        return;
      }
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "start") { request = message; audio = []; send({ type: "listening" }); }
        if (message.type === "stop" && request) { const details = request; request = null; ask(details, audio); audio = []; }
        if (message.type === "ask") ask(message, []);
      } catch { send({ type: "error", message: "Invalid voice message." }); }
    });
  });

  server.listen(port, () => console.log(`Astra ready on http://localhost:${port}`));
});
