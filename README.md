# Rot Blocker

A Chrome extension where pop-culture characters (Obama, David Goggins, Tung Tung
Tung Sahur) guard your distracting sites. Hit a blocked site and a character
takes over the screen — you either give up, or argue your way past them.

Full details: [`docs/mvp-spec.md`](docs/mvp-spec.md).
[![Watch the video](https://i.sstatic.net/Vp2cE.png)]([![Watch the video](https://i.sstatic.net/Vp2cE.png)](https://youtu.be/vt5fpE0bzSY)
)



## What's here

- `extension/` — the Chrome extension (Manifest V3)
- `server/` — thin proxy that holds the OpenAI key and answers argue requests

## Run it

You need two things running: the **server** (talks to OpenAI) and the
**extension** loaded in Chrome.

### 1. Start the server

```bash
cd server
cp .env.example .env      # then put your OPENAI_API_KEY in .env
node local.js
```

Serves `http://localhost:3000/api/chat`. More options in
[`server/README.md`](server/README.md).

### 2. Load the extension

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder

The extension defaults to the local server. To point at a deployed server, edit
`CHAT_ENDPOINT` in `extension/background.js`.

### 3. Try it

Open the extension popup to pick a persona and edit the blocklist, then navigate
to a blocked site (e.g. `youtube.com`) — the gatekeeper appears. Argue your way
in, or hit "Fine, take me back" to bail.
