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
  role?: "black" | "white" | "spectator";
  gameId?: string;
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

const JSON_HEADERS = {
  "content-type": "application/json"
};

export class GameRoomDurableObject {
  private room?: GameRoom;
  private connections: Map<string, ConnectionContext> = new Map();

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") === "websocket" && url.pathname === "/ws") {
      return this.handleWebSocket(request);
    }

    if (request.method === "POST" && url.pathname === "/init") {
      const room = await this.ensureRoom();
      return new Response(JSON.stringify({ id: room.state.id }), {
        status: 201,
        headers: JSON_HEADERS
      });
    }

    if (request.method === "GET" && url.pathname === "/summary") {
      const room = await this.ensureRoom();
      return new Response(JSON.stringify(this.buildSummary(room)), {
        headers: JSON_HEADERS
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: JSON_HEADERS
    });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    await this.ensureRoom();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const connectionId = crypto.randomUUID();
    const context: ConnectionContext = {
      id: connectionId,
      socket: server
    };
    this.connections.set(connectionId, context);

    server.accept();

    server.addEventListener("message", (event: MessageEvent) => {
      const data = event.data;
      const raw =
        typeof data === "string"
          ? data
          : data instanceof ArrayBuffer
          ? new TextDecoder().decode(data)
          : ArrayBuffer.isView(data)
          ? new TextDecoder().decode(data.buffer)
          : String(data);
      this.state.waitUntil(this.handleRawMessage(connectionId, raw));
    });

    server.addEventListener("close", () => {
      this.removeConnection(connectionId);
    });

    server.addEventListener("error", (event: Event) => {
      console.error("WebSocket error", event);
      this.removeConnection(connectionId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async ensureRoom(): Promise<GameRoom> {
    if (this.room) {
      return this.room;
    }

    await this.state.blockConcurrencyWhile(async () => {
      if (this.room) return;
      const stored = await this.state.storage.get<GameState>("state");
      if (stored) {
        this.room = {
          state: stored,
          players: {},
          spectators: new Set()
        };
      } else {
        const id = this.state.id.toString();
        const state = createEmptyGame(id);
        this.room = {
          state,
          players: {},
          spectators: new Set()
        };
        await this.persistState();
      }
    });

    if (!this.room) {
      throw new Error("Failed to initialize game room");
    }
    return this.room;
  }

  private async persistState(): Promise<void> {
    if (!this.room) return;
    await this.state.storage.put("state", this.room.state);
  }

  private removeConnection(connectionId: string): void {
    const context = this.connections.get(connectionId);
    if (!context) return;
    this.connections.delete(connectionId);

    const room = this.room;
    if (!room) return;

    const { role, name } = context;
    if (role === "black" || role === "white") {
      if (room.players[role]?.connectionId === connectionId) {
        delete room.players[role];
      }
    } else if (role === "spectator") {
      room.spectators.delete(connectionId);
    }

    this.broadcast(room.state.id, {
      type: "info",
      message: `${name ?? "A player"} disconnected`
    });
    this.broadcastState(room.state.id);
  }

  private async handleRawMessage(connectionId: string, raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(connectionId, "Invalid JSON payload");
      return;
    }
    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.sendError(connectionId, "Invalid message payload");
      return;
    }
    await this.handleMessage(connectionId, result.data);
  }

  private async handleMessage(connectionId: string, message: ClientMessage): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    console.log("handleMessage", { connectionId, type: message.type });

    switch (message.type) {
      case "join":
        await this.handleJoin(connection, message.gameId, message.name);
        break;
      case "updateSetup":
        await this.handleUpdateSetup(connection, message.positions);
        break;
      case "setReady":
        await this.handleSetReady(connection, message.ready);
        break;
      case "makeMove":
        await this.handleMakeMove(connection, message.move);
        break;
      case "requestState": {
        const room = this.room;
        if (room) {
          this.broadcastState(room.state.id, connectionId);
        }
        break;
      }
      default:
        this.sendError(connectionId, "Unsupported message");
    }
  }

  private async handleJoin(connection: ConnectionContext, gameId: string, name: string): Promise<void> {
    const room = await this.ensureRoom();
    if (gameId !== room.state.id) {
      this.sendError(connection.id, "Game not found");
      return;
    }

    // Remove from previous role if needed.
    if (connection.role) {
      if (connection.role === "black" || connection.role === "white") {
        if (room.players[connection.role]?.connectionId === connection.id) {
          delete room.players[connection.role];
        }
      } else if (connection.role === "spectator") {
        room.spectators.delete(connection.id);
      }
    }

    const assignedRole = this.assignRole(room, connection.id, name);
    connection.role = assignedRole;
    connection.name = name;
    connection.gameId = room.state.id;

    const ack: ServerMessage = {
      type: "ack",
      connectionId: connection.id,
      role: assignedRole
    };
    console.log("send ack", ack);
    this.send(connection.id, ack);

    if (assignedRole === "black" || assignedRole === "white") {
      const activePlayers = this.getActivePlayerCount(room);
      if (room.state.phase === "lobby" && activePlayers === 2) {
        room.state.phase = "setup";
        room.state.updatedAt = Date.now();
        await this.persistState();
      } else {
        await this.persistState();
      }
    }

    this.broadcastState(room.state.id, connection.id);
    this.broadcast(room.state.id, {
      type: "info",
      message: `${name} joined as ${assignedRole}`
    });
    this.broadcastState(room.state.id);
  }

  private async handleUpdateSetup(connection: ConnectionContext, positions: Coord[]): Promise<void> {
    const room = this.room;
    if (!room || !connection.role || connection.role === "spectator") {
      this.sendError(connection.id, "You must join a game as a player to configure setup");
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
    await this.persistState();
    this.broadcastState(room.state.id);
  }

  private async handleSetReady(connection: ConnectionContext, ready: boolean): Promise<void> {
    const room = this.room;
    if (!room || !connection.role || connection.role === "spectator") {
      this.sendError(connection.id, "You must join as a player to confirm setup");
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
    await this.persistState();
    this.broadcastState(room.state.id);

    if (ready) {
      const startResult = canStartGame(room.state);
      if (startResult.ok) {
        const started = startGameFromSetup(room.state);
        if (!started.ok) {
          this.sendError(connection.id, started.error);
          return;
        }
        await this.persistState();
        this.broadcast(room.state.id, {
          type: "info",
          message: "Game has begun! Black to move."
        });
        this.broadcastState(room.state.id);
      }
    }
  }

  private async handleMakeMove(connection: ConnectionContext, command: MoveCommand): Promise<void> {
    const room = this.room;
    if (!room || !connection.role || connection.role === "spectator") {
      this.sendError(connection.id, "You must join as a player to move pieces");
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
      this.broadcast(room.state.id, {
        type: "info",
        message: infoParts.join(" ")
      });
    }

    if (turnEnded) {
      this.broadcast(room.state.id, {
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
      this.broadcast(room.state.id, { type: "info", message });
    }

    await this.persistState();
    this.broadcastState(room.state.id);
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
    const room = this.room;
    if (!room) return;

    const broadcast = this.buildBroadcast(room);
    const message: ServerMessage = {
      type: "state",
      payload: broadcast
    };

    if (targetConnection) {
      console.log("broadcast state (target)", { connectionId: targetConnection });
      this.send(targetConnection, message);
      return;
    }

    const recipients = [
      ...room.spectators,
      ...Object.values(room.players)
        .filter((seat): seat is PlayerSeat => Boolean(seat))
        .map((seat) => seat.connectionId)
    ];
    console.log("broadcast state (all)", { recipients });
    recipients.forEach((id) => this.send(id, message));
  }

  private broadcast(gameId: string, message: ServerMessage): void {
    const room = this.room;
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
      console.log("sending message", { connectionId, type: message.type });
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

  private buildSummary(room: GameRoom) {
    const broadcast = this.buildBroadcast(room);
    return {
      id: room.state.id,
      phase: room.state.phase,
      players: broadcast.players,
      createdAt: room.state.createdAt,
      updatedAt: room.state.updatedAt
    };
  }

  private isCompleted(state: GameState): boolean {
    return state.phase === "completed";
  }
}

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
