import type { WebSocket } from "ws";
import { GameBroadcast, GameState } from "@margrites/shared";
interface ConnectionContext {
    id: string;
    socket: WebSocket;
    name?: string;
    gameId?: string;
    role?: "black" | "white" | "spectator";
}
export declare class GameManager {
    private rooms;
    private connections;
    createGame(): GameState;
    getGameState(gameId: string): GameState | undefined;
    addConnection(socket: WebSocket): ConnectionContext;
    removeConnection(connectionId: string): void;
    handleRawMessage(connectionId: string, raw: string): void;
    private handleMessage;
    private handleJoin;
    private leaveGame;
    private handleUpdateSetup;
    private handleSetReady;
    private handleMakeMove;
    private assignRole;
    private getActivePlayerCount;
    private broadcastState;
    getGameBroadcast(gameId: string): GameBroadcast | undefined;
    private broadcast;
    private send;
    private sendError;
    private buildBroadcast;
    private isCompleted;
}
export {};
