// Rot Blocker — local dev server (no Vercel account needed).
// Runs the same /api/chat handler over plain Node http.
//   1. put your key in server/.env
//   2. node local.js   (from the server/ folder)
// Serves http://localhost:3000/api/chat

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (avoids a dotenv dependency).
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    req.body = raw; // handler JSON-parses string bodies
    // Shim the Vercel res helpers the handler expects.
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (obj) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
      return res;
    };

    if (req.url.split("?")[0] === "/api/chat") {
      handler(req, res);
    } else {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
});

server.listen(PORT, () => {
  console.log(`Rot Blocker server on http://localhost:${PORT}/api/chat`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("WARNING: OPENAI_API_KEY not set — put it in server/.env");
  }
});
