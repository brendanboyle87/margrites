import type { Coord } from "./game/board";

export type PlayerColor = "black" | "white";

export type GamePhase = "lobby" | "setup" | "in-progress" | "completed";

export interface PieceState {
  id: string;
  owner: PlayerColor;
  position: Coord | null;
  status: PieceStatus;
}

export type PieceStatus = "active" | "captured" | "scored";

export interface MoveCommand {
  pieceId: string;
  to: Coord;
}

export interface MoveHistoryEntry {
  turn: number;
  moveIndex: number;
  player: PlayerColor;
  pieceId: string;
  from: Coord;
  to: Coord | null;
  scored: boolean;
  capturedPieces: string[];
  createdAt: number;
}

export interface SetupState {
  positions: Record<PlayerColor, Coord[]>;
  ready: Record<PlayerColor, boolean>;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  createdAt: number;
  updatedAt: number;
  turn: PlayerColor;
  turnNumber: number;
  movesTaken: number;
  turnOrigins: Record<string, Coord>;
  pieces: Record<string, PieceState>;
  board: Record<string, string>;
  scores: Record<PlayerColor, number>;
  captures: Record<PlayerColor, number>;
  setup: SetupState;
  history: MoveHistoryEntry[];
  winner?: PlayerColor;
  tie?: boolean;
}

export interface PlayerDescriptor {
  color: PlayerColor;
  name?: string;
  connected: boolean;
}

export interface GameBroadcast {
  state: GameState;
  players: PlayerDescriptor[];
}

export type ClientMessage =
  | {
      type: "join";
      gameId: string;
      name: string;
    }
  | {
      type: "updateSetup";
      positions: Coord[];
    }
  | {
      type: "setReady";
      ready: boolean;
    }
  | {
      type: "makeMove";
      move: MoveCommand;
    }
  | {
      type: "requestState";
    };

export type ServerMessage =
  | {
      type: "ack";
      connectionId: string;
      role: "black" | "white" | "spectator";
    }
  | {
      type: "state";
      payload: GameBroadcast;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "info";
      message: string;
    };
