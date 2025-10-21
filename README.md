# Margrites Online

Web application for playing the abstract strategy game Margrites. The implementation follows the rules from the accompanying PDF and keeps all state in memory.

## Project Structure

- `backend/` – Express + WebSocket server that manages lobbies, setup, and gameplay.
- `frontend/` – React client with lobby, setup, and live board play.
- `shared/` – Game rules, types, and engine logic shared by both sides.
- `docs/` – Summary of rules extracted from the PDF.

## Prerequisites

- Node.js 22.x (install with [fnm](https://github.com/Schniz/fnm) per workspace instructions).

## Install

```bash
fnm use 22.21.0 # or fnm use --install-if-missing 22
npm install
```

## Development

Run backend (port 4000) and frontend (port 5173) together:

```bash
npm run dev
```

Visit http://localhost:5173 and share the generated game ID with the second player.

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

## Gameplay Notes

- Two players join the same game ID; the first joined becomes Black, second White.
- Setup phase requires both players to place eight pieces within their two home rows and ready up.
- Turns grant four moves; the server enforces legality, capture rules (2:1 adjacency), and automatic turn hand-off when no legal moves remain.
- Game ends when one side has no pieces; score ties break on captures.
