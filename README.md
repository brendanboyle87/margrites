# Margrites Online

Web application for playing the abstract strategy game Margrites. The implementation follows the rules from the accompanying PDF and keeps all state in memory.

## Project Structure

- `cloudflare/` – Cloudflare Worker entry point and Durable Object implementation.
- `frontend/` – React client with lobby, setup, and live board play.
- `shared/` – Game rules, types, and engine logic shared by both sides.
- `backend/` – Legacy Express + WebSocket server kept for reference and parity.
- `docs/` – Summary of rules extracted from the PDF.

## Prerequisites

- Node.js 22.x (install with [fnm](https://github.com/Schniz/fnm) per workspace instructions).

## Install

```bash
fnm use 22.21.0 # or fnm use --install-if-missing 22
npm install
```

## Development

### Cloudflare Worker + Frontend (recommended)

This path mirrors the production deployment (Cloudflare Worker + Durable Object + Pages static hosting).

1. Install dependencies if you have not already: `npm install`.
2. Start the Worker locally (requires the `wrangler` CLI):

   ```bash
   npx wrangler dev --persist-to=./.wrangler-state
   ```

   The Worker listens on http://127.0.0.1:8787 and spins up an in-memory Durable Object for each game.

3. In a second terminal, run the frontend with API pointers to the Worker:

   ```bash
   VITE_API_BASE=http://127.0.0.1:8787 VITE_WS_BASE=ws://127.0.0.1:8787 npm --workspace frontend run dev
   ```

4. Open http://localhost:5173 and create/join games as usual.

The frontend falls back to same-origin calls when the `VITE_API_BASE`/`VITE_WS_BASE` variables are unset, so Pages deployments work without additional configuration once the Worker lives on the same domain.

### Legacy Express stack (optional)

The previous Express + `ws` server is still available for quick sanity checks:

```bash
npm run dev
```

It serves the API on port 4000 and the frontend on port 5173.

## Build

```bash
npm run build
```

Outputs production artifacts under `backend/dist` and `frontend/dist`.

## Tests

```bash
npm test
```

Runs Vitest coverage for the shared game engine.

## Cloudflare Deployment

1. Log in to Cloudflare and ensure the `wrangler` CLI can access your account: `npx wrangler login`.
2. Deploy the Worker (this also provisions the Durable Object defined in `wrangler.toml`):

   ```bash
   npx wrangler deploy
   ```

   The first deploy applies the `GameRoomDurableObject` migration and prints the Worker URL (e.g. `https://margrites-worker.your-subdomain.workers.dev`).

   > **Note:** On the free plan you must enable Durable Object Storage (the SQLite-backed beta feature) for the Worker in the Cloudflare dashboard or via `wrangler`. The Worker code persists its game state using that storage layer.

3. Build the frontend bundle:

   ```bash
   npm --workspace frontend run build
   ```

4. Deploy the generated static assets to Cloudflare Pages (replace `margrites-pages` with your Pages project name):

   ```bash
   npx wrangler pages deploy frontend/dist --project-name margrites-pages
   ```

5. In the Pages dashboard (or via `wrangler pages project` commands) set the following build-time environment variables so the client calls your Worker:

   - `VITE_API_BASE=https://margrites-worker.your-subdomain.workers.dev`
   - `VITE_WS_BASE=wss://margrites-worker.your-subdomain.workers.dev`

   Re-run the Pages deployment after saving the variables so they are baked into the bundle.

You can optionally add a custom domain or routes that map the Worker behind the same hostname as the Pages site. In that setup the environment variables can be omitted because the frontend will talk to the same origin.

### Using Cloudflare's Git Integrations

If you prefer Cloudflare to build directly from this repository instead of uploading pre-built assets:

1. **Pages project**
   - In the Pages dashboard choose *Connect to Git* and select this repo/branch.
   - Set the build command to `npm install && npm --workspace frontend run build`.
   - Set the build output directory to `frontend/dist`.
   - Define the same environment variables as above (`VITE_API_BASE`, `VITE_WS_BASE`) under both Production and Preview unless you wire the Worker behind the Pages domain.
   - Pushes to the watched branch will trigger new Pages deployments automatically.

2. **Worker (Durable Object)**
   - Create a Cloudflare API token with Worker edit permissions (or reuse `wrangler login` in CI).
   - Add a CI step that runs `npm install` followed by `npx wrangler deploy` (the token can be provided via `CLOUDFLARE_API_TOKEN`, and account id via `CLOUDFLARE_ACCOUNT_ID`).
   - Alternatively, enable the Wrangler GitHub Action ([`cloudflare/wrangler-action`](https://github.com/cloudflare/wrangler-action)) to deploy on each push.
   - Make sure the Worker has Durable Object Storage (SQLite) enabled in its settings so state persists on the free plan.

3. **Routing**
   - Once both deployments are live, add a Pages custom domain or route (e.g. `game.example.com`) and configure a Worker route (`game.example.com/*`) pointing at the Worker. The frontend can then omit the base URLs and rely on same-origin requests.

## Gameplay Notes

- Two players join the same game ID; the first joined becomes Black, second White.
- Setup phase requires both players to place eight pieces within their two home rows and ready up.
- Turns grant four moves; the server enforces legality, capture rules (2:1 adjacency), and automatic turn hand-off when no legal moves remain.
- Game ends when one side has no pieces; score ties break on captures.
