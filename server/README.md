# Rot Blocker — server

Thin proxy that holds the OpenAI key and answers the extension's argue requests.
Deployed on Vercel with **Root Directory** set to `server/`.

## Endpoint

`POST /api/chat`

Request:
```json
{
  "persona": "goggins",
  "history": [
    { "role": "assistant", "content": "Why should I let you through?" },
    { "role": "user", "content": "I need to check something for my research project." }
  ]
}
```

Response:
```json
{ "reply": "Alright, that's real. Get in and do the work.", "verdict": "allow", "reason": "..." }
```

`verdict` is one of `allow` | `deny` | `continue`.

## Run locally

Put your key in `.env` first:
```bash
cd server
cp .env.example .env      # then set OPENAI_API_KEY in .env
```

Then either:
```bash
node local.js             # zero-dependency runner, no Vercel account needed
# or
npx vercel dev            # matches the deployed environment (needs Vercel login)
```
Both serve `http://localhost:3000/api/chat`.

Test it:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"persona":"goggins","history":[{"role":"assistant","content":"Why should I let you through?"},{"role":"user","content":"I need it for a research project"}]}'
```

## Deploy

Import the repo in Vercel, set **Root Directory** to `server/`, and add
`OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) as environment variables.
Files in `server/api/` become endpoints automatically.
