"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameManager = void 0;
const crypto_1 = require("crypto");
const shared_1 = require("@margrites/shared");
const zod_1 = require("zod");
const coordSchema = zod_1.z.object({
    row: zod_1.z.number().int(),
    col: zod_1.z.number().int()
});
const clientMessageSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({
        type: zod_1.z.literal("join"),
        gameId: zod_1.z.string().min(1),
        name: zod_1.z.string().min(1)
    }),
    zod_1.z.object({
        type: zod_1.z.literal("updateSetup"),
        positions: zod_1.z.array(coordSchema)
    }),
    zod_1.z.object({
        type: zod_1.z.literal("setReady"),
        ready: zod_1.z.boolean()
    }),
    zod_1.z.object({
        type: zod_1.z.literal("makeMove"),
        move: zod_1.z.object({
            pieceId: zod_1.z.string().min(1),
            to: coordSchema
        })
    }),
    zod_1.z.object({
        type: zod_1.z.literal("requestState")
    })
]);
class GameManager {
    constructor() {
        this.rooms = new Map();
        this.connections = new Map();
    }
    createGame() {
        const id = (0, crypto_1.randomUUID)();
        const state = (0, shared_1.createEmptyGame)(id);
        this.rooms.set(id, {
            state,
            players: {},
            spectators: new Set()
        });
        return state;
    }
    getGameState(gameId) {
        return this.rooms.get(gameId)?.state;
    }
    addConnection(socket) {
        const context = {
            id: (0, crypto_1.randomUUID)(),
            socket
        };
        this.connections.set(context.id, context);
        return context;
    }
    removeConnection(connectionId) {
        const context = this.connections.get(connectionId);
        if (!context)
            return;
        const { gameId, role } = context;
        this.connections.delete(connectionId);
        if (gameId) {
            const room = this.rooms.get(gameId);
            if (!room)
                return;
            if (role === "black" || role === "white") {
                if (room.players[role]?.connectionId === connectionId) {
                    delete room.players[role];
                }
            }
            else if (role === "spectator") {
                room.spectators.delete(connectionId);
            }
            this.broadcast(gameId, {
                type: "info",
                message: `${context.name ?? "A player"} disconnected`
            });
            this.broadcastState(gameId);
        }
    }
    handleRawMessage(connectionId, raw) {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            this.sendError(connectionId, "Invalid JSON payload");
            return;
        }
        const parseResult = clientMessageSchema.safeParse(parsed);
        if (!parseResult.success) {
            this.sendError(connectionId, "Invalid message payload");
            return;
        }
        this.handleMessage(connectionId, parseResult.data);
    }
    handleMessage(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        switch (message.type) {
            case "join":
                this.handleJoin(connection, message.gameId, message.name);
                break;
            case "updateSetup":
                this.handleUpdateSetup(connection, message.positions);
                break;
            case "setReady":
                this.handleSetReady(connection, message.ready);
                break;
            case "makeMove":
                this.handleMakeMove(connection, message.move);
                break;
            case "requestState":
                if (connection.gameId) {
                    this.broadcastState(connection.gameId, connectionId);
                }
                break;
            default:
                this.sendError(connectionId, "Unsupported message");
        }
    }
    handleJoin(connection, gameId, name) {
        const room = this.rooms.get(gameId);
        if (!room) {
            this.sendError(connection.id, "Game not found");
            return;
        }
        // Remove from previous game if present
        if (connection.gameId && connection.gameId !== gameId) {
            this.leaveGame(connection);
        }
        const assignedRole = this.assignRole(room, connection.id, name);
        connection.gameId = gameId;
        connection.role = assignedRole;
        connection.name = name;
        const ack = {
            type: "ack",
            connectionId: connection.id,
            role: assignedRole
        };
        this.send(connection.id, ack);
        if (assignedRole === "black" || assignedRole === "white") {
            const activePlayers = this.getActivePlayerCount(room);
            if (room.state.phase === "lobby" && activePlayers === 2) {
                room.state.phase = "setup";
                room.state.updatedAt = Date.now();
            }
        }
        else {
            room.spectators.add(connection.id);
        }
        this.broadcast(gameId, {
            type: "info",
            message: `${name} joined as ${assignedRole}`
        });
        this.broadcastState(gameId);
    }
    leaveGame(connection) {
        if (!connection.gameId)
            return;
        const room = this.rooms.get(connection.gameId);
        if (!room)
            return;
        if (connection.role === "black" || connection.role === "white") {
            if (room.players[connection.role]?.connectionId === connection.id) {
                delete room.players[connection.role];
            }
        }
        else if (connection.role === "spectator") {
            room.spectators.delete(connection.id);
        }
    }
    handleUpdateSetup(connection, positions) {
        if (!connection.gameId || !connection.role || connection.role === "spectator") {
            this.sendError(connection.id, "You must join a game as a player to configure setup");
            return;
        }
        const room = this.rooms.get(connection.gameId);
        if (!room) {
            this.sendError(connection.id, "Game not found");
            return;
        }
        if (room.state.phase !== "setup") {
            this.sendError(connection.id, "Setup phase has ended");
            return;
        }
        const result = (0, shared_1.setSetupPositions)(room.state, connection.role, positions);
        if (!result.ok) {
            this.sendError(connection.id, result.error);
            return;
        }
        this.broadcastState(connection.gameId);
    }
    handleSetReady(connection, ready) {
        if (!connection.gameId || !connection.role || connection.role === "spectator") {
            this.sendError(connection.id, "You must join as a player to confirm setup");
            return;
        }
        const room = this.rooms.get(connection.gameId);
        if (!room) {
            this.sendError(connection.id, "Game not found");
            return;
        }
        if (room.state.phase !== "setup") {
            this.sendError(connection.id, "Setup phase has ended");
            return;
        }
        const result = (0, shared_1.setSetupReady)(room.state, connection.role, ready);
        if (!result.ok) {
            this.sendError(connection.id, result.error);
            return;
        }
        this.broadcastState(connection.gameId);
        if (ready) {
            const startResult = (0, shared_1.canStartGame)(room.state);
            if (startResult.ok) {
                const started = (0, shared_1.startGameFromSetup)(room.state);
                if (!started.ok) {
                    this.sendError(connection.id, started.error);
                    return;
                }
                this.broadcast(connection.gameId, {
                    type: "info",
                    message: "Game has begun! Black to move."
                });
                this.broadcastState(connection.gameId);
            }
        }
    }
    handleMakeMove(connection, command) {
        if (!connection.gameId || !connection.role || connection.role === "spectator") {
            this.sendError(connection.id, "You must join as a player to move pieces");
            return;
        }
        const room = this.rooms.get(connection.gameId);
        if (!room) {
            this.sendError(connection.id, "Game not found");
            return;
        }
        if (room.state.phase !== "in-progress") {
            this.sendError(connection.id, "Game is not in progress");
            return;
        }
        const result = (0, shared_1.applyMove)(room.state, connection.role, command);
        if (!result.ok) {
            this.sendError(connection.id, result.error);
            return;
        }
        const { outcome, turnEnded } = result.value;
        const captures = outcome.captured.length
            ? `Captured ${outcome.captured.length} piece(s).`
            : "";
        const scoredText = outcome.scored ? "Scored a point!" : "";
        const infoParts = [captures, scoredText].filter(Boolean);
        if (infoParts.length > 0) {
            this.broadcast(connection.gameId, {
                type: "info",
                message: infoParts.join(" ")
            });
        }
        if (turnEnded) {
            this.broadcast(connection.gameId, {
                type: "info",
                message: `Turn complete. ${room.state.turn === "black" ? "Black" : "White"} to move.`
            });
        }
        if (this.isCompleted(room.state)) {
            let message = "Game over. ";
            if (room.state.tie) {
                message += "Match ended in a tie.";
            }
            else if (room.state.winner) {
                message += `${capitalize(room.state.winner)} wins!`;
            }
            this.broadcast(connection.gameId, { type: "info", message });
        }
        this.broadcastState(connection.gameId);
    }
    assignRole(room, connectionId, name) {
        if (!room.players.black) {
            room.players.black = { connectionId, name };
            return "black";
        }
        if (!room.players.white) {
            room.players.white = { connectionId, name };
            return "white";
        }
        room.spectators.add(connectionId);
        return "spectator";
    }
    getActivePlayerCount(room) {
        return ["black", "white"].reduce((count, color) => {
            const seat = room.players[color];
            return count + (seat ? 1 : 0);
        }, 0);
    }
    broadcastState(gameId, targetConnection) {
        const room = this.rooms.get(gameId);
        if (!room)
            return;
        const broadcast = this.buildBroadcast(room);
        const message = {
            type: "state",
            payload: broadcast
        };
        if (targetConnection) {
            this.send(targetConnection, message);
            return;
        }
        const recipients = [
            ...room.spectators,
            ...Object.values(room.players)
                .filter((seat) => Boolean(seat))
                .map((seat) => seat.connectionId)
        ];
        recipients.forEach((id) => this.send(id, message));
    }
    getGameBroadcast(gameId) {
        const room = this.rooms.get(gameId);
        if (!room)
            return undefined;
        return this.buildBroadcast(room);
    }
    broadcast(gameId, message) {
        const room = this.rooms.get(gameId);
        if (!room)
            return;
        const recipients = [
            ...room.spectators,
            ...Object.values(room.players)
                .filter((seat) => Boolean(seat))
                .map((seat) => seat.connectionId)
        ];
        recipients.forEach((id) => this.send(id, message));
    }
    send(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        try {
            connection.socket.send(JSON.stringify(message));
        }
        catch (error) {
            console.error("Failed to send message", error);
        }
    }
    sendError(connectionId, message) {
        this.send(connectionId, {
            type: "error",
            message
        });
    }
    buildBroadcast(room) {
        return {
            state: room.state,
            players: ["black", "white"].map((color) => ({
                color,
                name: room.players[color]?.name,
                connected: Boolean(room.players[color])
            }))
        };
    }
    isCompleted(state) {
        return state.phase === "completed";
    }
}
exports.GameManager = GameManager;
const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
