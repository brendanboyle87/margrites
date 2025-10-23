import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import {
  applyMove,
  canStartGame,
  createEmptyGame,
  GameBroadcast,
  GameState,
  PlayerColor,
  setSetupPositions,
  setSetupReady,
  startGameFromSetup
} from "@margrites/shared";
import type { ClientMessage, Coord, MoveCommand, ServerMessage } from "@margrites/shared";
import { z } from "zod";

interface ConnectionContext {
  id: string;
  socket: WebSocket;
  name?: string;
  gameId?: string;
  role?: "black" | "white" | "spectator";
}

interface PlayerSeat {
  connectionId: string;
  name: string;
}

interface GameRoom {
  state: GameState;
  players: Partial<Record<PlayerColor, PlayerSeat>>;
  spectators: Set<string>;
}

const coordSchema = z.object({
  row: z.number().int(),
  col: z.number().int()
});

const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    gameId: z.string().min(1),
    name: z.string().min(1)
  }),
  z.object({
    type: z.literal("updateSetup"),
    positions: z.array(coordSchema)
  }),
  z.object({
    type: z.literal("setReady"),
    ready: z.boolean()
  }),
  z.object({
    type: z.literal("makeMove"),
    move: z.object({
      pieceId: z.string().min(1),
      to: coordSchema
    })
  }),
  z.object({
    type: z.literal("requestState")
  })
] as const);

export class GameManager {
  private rooms: Map<string, GameRoom> = new Map();
  private connections: Map<string, ConnectionContext> = new Map();

  createGame(): GameState {
    const id = randomUUID();
    const state = createEmptyGame(id);
    this.rooms.set(id, {
      state,
      players: {},
      spectators: new Set()
    });
    return state;
  }

  getGameState(gameId: string): GameState | undefined {
    return this.rooms.get(gameId)?.state;
  }

  addConnection(socket: WebSocket): ConnectionContext {
    const context: ConnectionContext = {
      id: randomUUID(),
      socket
    };
    this.connections.set(context.id, context);
    return context;
  }

  removeConnection(connectionId: string): void {
    const context = this.connections.get(connectionId);
    if (!context) return;
    const { gameId, role } = context;
    this.connections.delete(connectionId);

    if (gameId) {
      const room = this.rooms.get(gameId);
      if (!room) return;

      if (role === "black" || role === "white") {
        if (room.players[role]?.connectionId === connectionId) {
          delete room.players[role];
        }
      } else if (role === "spectator") {
        room.spectators.delete(connectionId);
      }

      this.broadcast(gameId, {
        type: "info",
        message: `${context.name ?? "A player"} disconnected`
      });
      this.broadcastState(gameId);
    }
  }

  handleRawMessage(connectionId: string, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
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

  private handleMessage(connectionId: string, message: ClientMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

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

  private handleJoin(connection: ConnectionContext, gameId: string, name: string): void {
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

    const ack: ServerMessage = {
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
    } else {
      room.spectators.add(connection.id);
    }

    this.broadcast(gameId, {
      type: "info",
      message: `${name} joined as ${assignedRole}`
    });
    this.broadcastState(gameId);
  }

  private leaveGame(connection: ConnectionContext): void {
    if (!connection.gameId) return;
    const room = this.rooms.get(connection.gameId);
    if (!room) return;

    if (connection.role === "black" || connection.role === "white") {
      if (room.players[connection.role]?.connectionId === connection.id) {
        delete room.players[connection.role];
      }
    } else if (connection.role === "spectator") {
      room.spectators.delete(connection.id);
    }
  }

  private handleUpdateSetup(connection: ConnectionContext, positions: Coord[]): void {
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

    const result = setSetupPositions(room.state, connection.role, positions);
    if (!result.ok) {
      this.sendError(connection.id, result.error);
      return;
    }
    this.broadcastState(connection.gameId);
  }

  private handleSetReady(connection: ConnectionContext, ready: boolean): void {
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

    const result = setSetupReady(room.state, connection.role, ready);
    if (!result.ok) {
      this.sendError(connection.id, result.error);
      return;
    }
    this.broadcastState(connection.gameId);

    if (ready) {
      const startResult = canStartGame(room.state);
      if (startResult.ok) {
        const started = startGameFromSetup(room.state);
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

  private handleMakeMove(connection: ConnectionContext, command: MoveCommand): void {
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

    const result = applyMove(room.state, connection.role, command);
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
      } else if (room.state.winner) {
        message += `${capitalize(room.state.winner)} wins!`;
      }
      this.broadcast(connection.gameId, { type: "info", message });
    }

    this.broadcastState(connection.gameId);
  }

  private assignRole(room: GameRoom, connectionId: string, name: string): "black" | "white" | "spectator" {
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

  private getActivePlayerCount(room: GameRoom): number {
    return ["black", "white"].reduce((count, color) => {
      const seat = room.players[color as PlayerColor];
      return count + (seat ? 1 : 0);
    }, 0);
  }

  private broadcastState(gameId: string, targetConnection?: string): void {
    const room = this.rooms.get(gameId);
    if (!room) return;

    const broadcast = this.buildBroadcast(room);

    const message: ServerMessage = {
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
        .filter((seat): seat is PlayerSeat => Boolean(seat))
        .map((seat) => seat.connectionId)
    ];

    recipients.forEach((id) => this.send(id, message));
  }

  getGameBroadcast(gameId: string): GameBroadcast | undefined {
    const room = this.rooms.get(gameId);
    if (!room) return undefined;
    return this.buildBroadcast(room);
  }

  private broadcast(gameId: string, message: ServerMessage): void {
    const room = this.rooms.get(gameId);
    if (!room) return;

    const recipients = [
      ...room.spectators,
      ...Object.values(room.players)
        .filter((seat): seat is PlayerSeat => Boolean(seat))
        .map((seat) => seat.connectionId)
    ];

    recipients.forEach((id) => this.send(id, message));
  }

  private send(connectionId: string, message: ServerMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    try {
      connection.socket.send(JSON.stringify(message));
    } catch (error) {
      console.error("Failed to send message", error);
    }
  }

  private sendError(connectionId: string, message: string): void {
    this.send(connectionId, {
      type: "error",
      message
    });
  }

  private buildBroadcast(room: GameRoom): GameBroadcast {
    return {
      state: room.state,
      players: (["black", "white"] as PlayerColor[]).map((color) => ({
        color,
        name: room.players[color]?.name,
        connected: Boolean(room.players[color])
      }))
    };
  }

  private isCompleted(state: GameState): boolean {
    return state.phase === "completed";
  }
}

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
