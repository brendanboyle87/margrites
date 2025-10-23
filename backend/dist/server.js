"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("ws");
const gameManager_1 = require("./gameManager");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const gameManager = new gameManager_1.GameManager();
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
const httpServer = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server: httpServer, path: "/ws" });
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
