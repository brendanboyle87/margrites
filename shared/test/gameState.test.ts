import { describe, expect, it } from "vitest";
import {
  applyMove,
  canStartGame,
  coordKey,
  countActivePieces,
  createEmptyGame,
  setSetupPositions,
  setSetupReady,
  startGameFromSetup
} from "@margrites/shared";
import type { GameState, PlayerColor } from "@margrites/shared";

const BLACK_SETUP = [
  { row: 0, col: 0 },
  { row: 0, col: 2 },
  { row: 0, col: 4 },
  { row: 0, col: 6 },
  { row: 1, col: 0 },
  { row: 1, col: 2 },
  { row: 1, col: 4 },
  { row: 1, col: 6 }
] as const;

const WHITE_SETUP = [
  { row: 7, col: 1 },
  { row: 7, col: 3 },
  { row: 7, col: 5 },
  { row: 7, col: 7 },
  { row: 8, col: 1 },
  { row: 8, col: 3 },
  { row: 8, col: 5 },
  { row: 8, col: 7 }
] as const;

const startStandardGame = (): GameState => {
  const state = createEmptyGame("standard");
  expect(setSetupPositions(state, "black", [...BLACK_SETUP]).ok).toBe(true);
  expect(setSetupPositions(state, "white", [...WHITE_SETUP]).ok).toBe(true);
  expect(setSetupReady(state, "black", true).ok).toBe(true);
  expect(setSetupReady(state, "white", true).ok).toBe(true);
  expect(canStartGame(state).ok).toBe(true);
  const started = startGameFromSetup(state);
  if (!started.ok) {
    throw new Error(`Failed to start standard game: ${started.error}`);
  }
  return state;
};

const buildActiveState = (turn: PlayerColor): GameState => {
  const state = createEmptyGame("scenario");
  state.phase = "in-progress";
  state.turn = turn;
  state.turnNumber = 1;
  state.movesTaken = 0;
  state.pieces = {};
  state.board = {};
  state.turnOrigins = {};
  state.scores = { black: 0, white: 0 };
  state.captures = { black: 0, white: 0 };
  state.updatedAt = Date.now();
  return state;
};

describe("game state setup", () => {
  it("starts a game after both players ready valid placements", () => {
    const state = startStandardGame();
    expect(state.phase).toBe("in-progress");
    expect(state.turn).toBe("black");
    expect(Object.keys(state.pieces)).toHaveLength(16);
    expect(Object.keys(state.board)).toHaveLength(16);
    expect(countActivePieces(state, "black")).toBe(8);
    expect(countActivePieces(state, "white")).toBe(8);
  });
});

describe("movement", () => {
  it("moves a piece, updates board, and keeps turn in progress", () => {
    const state = startStandardGame();
    const move = applyMove(state, "black", {
      pieceId: "black-0",
      to: { row: 1, col: 1 }
    });
    expect(move.ok).toBe(true);
    expect(state.pieces["black-0"].position).toStrictEqual({ row: 1, col: 1 });
    expect(state.board[coordKey({ row: 1, col: 1 })]).toBe("black-0");
    expect(state.movesTaken).toBe(1);
    expect(state.turn).toBe("black");
  });

  it("captures opposing pieces when 2:1 adjacency threshold is met", () => {
    const state = buildActiveState("black");
    state.pieces = {
      "black-0": {
        id: "black-0",
        owner: "black",
        status: "active",
        position: { row: 4, col: 3 }
      },
      "black-1": {
        id: "black-1",
        owner: "black",
        status: "active",
        position: { row: 5, col: 5 }
      },
      "white-0": {
        id: "white-0",
        owner: "white",
        status: "active",
        position: { row: 4, col: 4 }
      }
    };
    state.board[coordKey({ row: 4, col: 3 })] = "black-0";
    state.board[coordKey({ row: 5, col: 5 })] = "black-1";
    state.board[coordKey({ row: 4, col: 4 })] = "white-0";
    state.turnOrigins = {
      "black-0": { row: 4, col: 3 },
      "black-1": { row: 5, col: 5 }
    };

    const result = applyMove(state, "black", {
      pieceId: "black-1",
      to: { row: 5, col: 4 }
    });

    expect(result.ok).toBe(true);
    expect(state.board[coordKey({ row: 5, col: 4 })]).toBe("black-1");
    expect(state.pieces["white-0"].status).toBe("captured");
    expect(state.board[coordKey({ row: 4, col: 4 })]).toBeUndefined();
    expect(state.captures.black).toBe(1);
  });

  it("rejects moves that would martyr the moving piece", () => {
    const state = buildActiveState("black");
    state.pieces = {
      "black-0": {
        id: "black-0",
        owner: "black",
        status: "active",
        position: { row: 4, col: 4 }
      },
      "white-0": {
        id: "white-0",
        owner: "white",
        status: "active",
        position: { row: 4, col: 5 }
      },
      "white-1": {
        id: "white-1",
        owner: "white",
        status: "active",
        position: { row: 5, col: 6 }
      }
    };
    state.board[coordKey({ row: 4, col: 4 })] = "black-0";
    state.board[coordKey({ row: 4, col: 5 })] = "white-0";
    state.board[coordKey({ row: 5, col: 6 })] = "white-1";
    state.turnOrigins = {
      "black-0": { row: 4, col: 4 }
    };

    const result = applyMove(state, "black", {
      pieceId: "black-0",
      to: { row: 5, col: 5 }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/martyrdom/i);
    expect(state.pieces["black-0"].position).toStrictEqual({ row: 4, col: 4 });
  });

  it("scores when moving off the far edge", () => {
    const state = buildActiveState("black");
    state.pieces = {
      "black-0": {
        id: "black-0",
        owner: "black",
        status: "active",
        position: { row: 8, col: 3 }
      }
    };
    state.board[coordKey({ row: 8, col: 3 })] = "black-0";
    state.turnOrigins = {
      "black-0": { row: 8, col: 3 }
    };

    const result = applyMove(state, "black", {
      pieceId: "black-0",
      to: { row: 9, col: 3 }
    });

    expect(result.ok).toBe(true);
    expect(state.scores.black).toBe(1);
    expect(state.pieces["black-0"].status).toBe("scored");
    expect(state.board[coordKey({ row: 8, col: 3 })]).toBeUndefined();
  });
});
