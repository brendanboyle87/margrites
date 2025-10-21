import cors from "cors";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { GameManager } from "./gameManager";

const app = express();
app.use(cors());
app.use(express.json());

const gameManager = new GameManager();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/games", (_req, res) => {
  const game = gameManager.createGame();
  res.status(201).json({ id: game.id });
});

app.get("/api/games/:id", (req, res) => {
  const gameId = req.params.id;
  const broadcast = gameManager.getGameBroadcast(gameId);
  if (!broadcast) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json({
    id: gameId,
    phase: broadcast.state.phase,
    players: broadcast.players,
    createdAt: broadcast.state.createdAt,
    updatedAt: broadcast.state.updatedAt
  });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (socket) => {
  const context = gameManager.addConnection(socket);

  socket.on("message", (data) => {
    gameManager.handleRawMessage(context.id, data.toString());
  });

  socket.on("close", () => {
    gameManager.removeConnection(context.id);
  });

  socket.on("error", (error) => {
    console.error("WebSocket error", error);
    gameManager.removeConnection(context.id);
  });
});

const PORT = Number(process.env.PORT ?? 4000);
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
