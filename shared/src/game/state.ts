import { BOARD_COLUMNS, BOARD_ROWS, MOVES_PER_TURN, PIECES_PER_SIDE } from "./constants";
import { adjacentCoords, coordKey, equalCoord, isInsideBoard, isScoringMove, isSetupRow } from "./board";
import type {
  GameState,
  MoveCommand,
  MoveHistoryEntry,
  PieceState,
  PlayerColor,
  SetupState
} from "../types";
import type { Coord } from "./board";
import type { LegalMove, MoveResolution } from "./move";

interface ValidationError {
  ok: false;
  error: string;
}

interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

type ValidationResult<T> = ValidationError | ValidationSuccess<T>;

interface SimulationContext {
  pieces: Record<string, PieceState>;
  board: Record<string, string>;
}

interface SimulationOutcome extends MoveResolution {
  newPosition: Coord | null;
}

export const createEmptyGame = (id: string): GameState => {
  const timestamp = Date.now();
  return {
    id,
    phase: "lobby",
    createdAt: timestamp,
    updatedAt: timestamp,
    turn: "black",
    turnNumber: 1,
    movesTaken: 0,
    turnOrigins: {},
    pieces: {},
    board: {},
    scores: { black: 0, white: 0 },
    captures: { black: 0, white: 0 },
    setup: createEmptySetupState(),
    history: []
  };
};

export const createEmptySetupState = (): SetupState => ({
  positions: { black: [], white: [] },
  ready: { black: false, white: false }
});

export const resetSetupState = (state: GameState): void => {
  state.setup = createEmptySetupState();
  state.updatedAt = Date.now();
};

export const setSetupPositions = (
  state: GameState,
  color: PlayerColor,
  positions: Coord[]
): ValidationResult<void> => {
  const validation = validateSetupPositions(color, positions);
  if (!validation.ok) {
    return validation;
  }
  state.setup.positions[color] = positions.map((coord) => ({ ...coord }));
  state.setup.ready[color] = false;
  state.updatedAt = Date.now();
  return { ok: true, value: undefined };
};

export const setSetupReady = (
  state: GameState,
  color: PlayerColor,
  ready: boolean
): ValidationResult<void> => {
  if (ready) {
    const validation = validateSetupPositions(color, state.setup.positions[color]);
    if (!validation.ok) {
      return validation;
    }
    if (state.setup.positions[color].length !== PIECES_PER_SIDE) {
      return {
        ok: false,
        error: `Setup must contain ${PIECES_PER_SIDE} pieces`
      };
    }
  }
  state.setup.ready[color] = ready;
  state.updatedAt = Date.now();
  return { ok: true, value: undefined };
};

export const canStartGame = (state: GameState): ValidationResult<void> => {
  if (!state.setup.ready.black || !state.setup.ready.white) {
    return { ok: false, error: "Both players must confirm their setups" };
  }
  const blackValidation = validateSetupPositions("black", state.setup.positions.black);
  if (!blackValidation.ok) {
    return blackValidation;
  }
  const whiteValidation = validateSetupPositions("white", state.setup.positions.white);
  if (!whiteValidation.ok) {
    return whiteValidation;
  }
  return { ok: true, value: undefined };
};

export const startGameFromSetup = (state: GameState): ValidationResult<void> => {
  const validation = canStartGame(state);
  if (!validation.ok) {
    return validation;
  }

  state.pieces = {};
  state.board = {};
  state.scores = { black: 0, white: 0 };
  state.captures = { black: 0, white: 0 };
  state.history = [];
  state.turnNumber = 1;
  state.turn = "black";
  state.movesTaken = 0;
  state.turnOrigins = {};
  state.winner = undefined;
  state.tie = undefined;

  createPiecesForColor(state, "black", state.setup.positions.black);
  createPiecesForColor(state, "white", state.setup.positions.white);

  state.phase = "in-progress";
  beginTurn(state, "black");
  state.updatedAt = Date.now();
  return { ok: true, value: undefined };
};

const createPiecesForColor = (state: GameState, color: PlayerColor, positions: Coord[]): void => {
  positions.forEach((position, index) => {
    const coord = { ...position };
    const id = `${color}-${index}`;
    state.pieces[id] = {
      id,
      owner: color,
      position: coord,
      status: "active"
    };
    state.board[coordKey(coord)] = id;
  });
};

export const beginTurn = (state: GameState, color: PlayerColor): void => {
  state.turn = color;
  state.movesTaken = 0;
  state.turnOrigins = {};
  Object.values(state.pieces)
    .filter((piece) => piece.owner === color && piece.status === "active" && piece.position)
    .forEach((piece) => {
      state.turnOrigins[piece.id] = { ...piece.position! };
    });
  state.updatedAt = Date.now();
};

export const switchTurn = (state: GameState): void => {
  state.turnNumber += 1;
  const nextTurn: PlayerColor = state.turn === "black" ? "white" : "black";
  beginTurn(state, nextTurn);
};

const validateSetupPositions = (color: PlayerColor, positions: Coord[]): ValidationResult<void> => {
  if (positions.length > PIECES_PER_SIDE) {
    return { ok: false, error: `Setup cannot exceed ${PIECES_PER_SIDE} pieces` };
  }
  const seen = new Set<string>();
  for (const coord of positions) {
    if (!Number.isInteger(coord.row) || !Number.isInteger(coord.col)) {
      return { ok: false, error: "Setup coordinates must be integers" };
    }
    if (!isInsideBoard(coord)) {
      return { ok: false, error: "Setup coordinates must be on the board" };
    }
    if (!isSetupRow(coord, color)) {
      return { ok: false, error: "Setup pieces must be within the first two rows" };
    }
    const key = coordKey(coord);
    if (seen.has(key)) {
      return { ok: false, error: "Setup coordinates must be unique" };
    }
    seen.add(key);
  }
  return { ok: true, value: undefined };
};

export const applyMove = (
  state: GameState,
  player: PlayerColor,
  command: MoveCommand
): ValidationResult<{ outcome: SimulationOutcome; turnEnded: boolean }> => {
  if (state.phase !== "in-progress") {
    return { ok: false, error: "Game is not in progress" };
  }
  if (state.winner || state.tie) {
    return { ok: false, error: "Game already completed" };
  }
  if (state.turn !== player) {
    return { ok: false, error: "Not your turn" };
  }
  if (state.movesTaken >= MOVES_PER_TURN) {
    return { ok: false, error: "Move limit reached" };
  }

  const piece = state.pieces[command.pieceId];
  if (!piece || piece.owner !== player || piece.status !== "active" || !piece.position) {
    return { ok: false, error: "Invalid piece" };
  }

  const simulation = simulateMove(state, command);
  if (!simulation.ok) {
    return simulation;
  }

  commitMove(state, simulation.value);
  state.movesTaken += 1;
  recordHistory(state, player, simulation.value);
  const gameEnded = evaluateGameCompletion(state);

  let turnEnded = false;
  if (!gameEnded) {
    if (state.movesTaken >= MOVES_PER_TURN) {
      switchTurn(state);
      turnEnded = true;
    } else if (!hasAnyLegalMove(state, state.turn)) {
      switchTurn(state);
      turnEnded = true;
    }
  }

  state.updatedAt = Date.now();
  return { ok: true, value: { outcome: simulation.value, turnEnded } };
};

const recordHistory = (state: GameState, player: PlayerColor, outcome: SimulationOutcome): void => {
  const entry: MoveHistoryEntry = {
    turn: state.turnNumber,
    moveIndex: state.movesTaken,
    player,
    pieceId: outcome.pieceId,
    from: outcome.from,
    to: outcome.newPosition,
    scored: outcome.scored,
    capturedPieces: [...outcome.captured],
    createdAt: Date.now()
  };
  state.history.push(entry);
};

const simulateMove = (state: GameState, command: MoveCommand): ValidationResult<SimulationOutcome> => {
  const piece = state.pieces[command.pieceId];
  if (!piece || piece.status !== "active" || !piece.position) {
    return { ok: false, error: "Piece is not movable" };
  }
  const from = piece.position;
  const to = command.to;

  if (!Number.isInteger(to.row) || !Number.isInteger(to.col)) {
    return { ok: false, error: "Move coordinates must be integers" };
  }

  const deltaRow = Math.abs(to.row - from.row);
  const deltaCol = Math.abs(to.col - from.col);

  if (deltaRow > 1 || deltaCol > 1) {
    return { ok: false, error: "Pieces move one square per move" };
  }
  if (deltaRow === 0 && deltaCol === 0) {
    return { ok: false, error: "Piece must move to a different square" };
  }

  const startCoord = state.turnOrigins[piece.id];
  if (startCoord && equalCoord(to, startCoord)) {
    return { ok: false, error: "Pieces cannot return to their starting square this turn" };
  }

  const isScoring = isScoringMove(from, to, piece.owner);
  const boardClone = { ...state.board };
  const piecesClone: Record<string, PieceState> = {};

  Object.entries(state.pieces).forEach(([id, original]) => {
    piecesClone[id] = {
      ...original,
      position: original.position ? { ...original.position } : null
    };
  });

  if (!isScoring) {
    if (!isInsideBoard(to)) {
      return { ok: false, error: "Move must remain on the board unless scoring" };
    }
    const targetKey = coordKey(to);
    if (boardClone[targetKey]) {
      return { ok: false, error: "Destination square is occupied" };
    }
  }

  const fromKey = coordKey(from);
  delete boardClone[fromKey];
  piecesClone[piece.id] = {
    ...piecesClone[piece.id],
    position: isScoring ? null : { ...to },
    status: isScoring ? "scored" : "active"
  };

  if (!isScoring) {
    const toKey = coordKey(to);
    boardClone[toKey] = piece.id;
  }

  const captured = resolveCaptures(piecesClone, boardClone);
  if (captured.includes(piece.id)) {
    return { ok: false, error: "Move would result in immediate capture (martyrdom rule)" };
  }

  const outcome: SimulationOutcome = {
    pieceId: piece.id,
    from: { ...from },
    to,
    scored: isScoring,
    captured,
    newPosition: isScoring ? null : { ...to }
  };
  return { ok: true, value: outcome };
};

const resolveCaptures = (pieces: Record<string, PieceState>, board: Record<string, string>): string[] => {
  const captured: string[] = [];

  const pending = new Set<string>(
    Object.keys(pieces).filter((id) => pieces[id].status === "active" && pieces[id].position)
  );

  while (pending.size > 0) {
    const toRemove: string[] = [];
    for (const id of pending) {
      const piece = pieces[id];
      if (piece.status !== "active" || !piece.position) {
        pending.delete(id);
        continue;
      }
      if (isCaptured(pieces, board, piece)) {
        toRemove.push(id);
      }
    }

    if (toRemove.length === 0) {
      break;
    }

    for (const id of toRemove) {
      const piece = pieces[id];
      if (piece.status !== "active" || !piece.position) continue;
      const key = coordKey(piece.position);
      delete board[key];
      piece.status = "captured";
      piece.position = null;
      captured.push(id);
      pending.delete(id);
    }

    // After removals, re-evaluate all active pieces.
    pending.clear();
    Object.keys(pieces)
      .filter((id) => pieces[id].status === "active" && pieces[id].position)
      .forEach((id) => pending.add(id));
  }

  return captured;
};

const isCaptured = (
  pieces: Record<string, PieceState>,
  board: Record<string, string>,
  piece: PieceState
): boolean => {
  if (!piece.position) return false;
  const neighbours = adjacentCoords(piece.position);
  let opponents = 0;
  let allies = 1; // include the piece itself

  for (const n of neighbours) {
    const occupantId = board[coordKey(n)];
    if (!occupantId) continue;
    const occupant = pieces[occupantId];
    if (!occupant || occupant.status !== "active") continue;
    if (occupant.owner === piece.owner) {
      allies += 1;
    } else {
      opponents += 1;
    }
  }

  return opponents >= 2 * allies;
};

const commitMove = (state: GameState, outcome: SimulationOutcome): void => {
  const piece = state.pieces[outcome.pieceId];
  if (!piece || piece.status !== "active" || !piece.position) {
    // Piece may have scored; ensure status set correctly
    if (outcome.scored) {
      state.pieces[outcome.pieceId] = {
        id: outcome.pieceId,
        owner: state.turn,
        position: null,
        status: "scored"
      };
    }
  }

  const fromKey = coordKey(outcome.from);
  delete state.board[fromKey];

  if (outcome.scored) {
    const scoringPiece = state.pieces[outcome.pieceId];
    scoringPiece.status = "scored";
    scoringPiece.position = null;
    state.scores[scoringPiece.owner] += 1;
  } else if (outcome.newPosition) {
    const targetKey = coordKey(outcome.newPosition);
    state.board[targetKey] = outcome.pieceId;
    const pieceState = state.pieces[outcome.pieceId];
    pieceState.position = { ...outcome.newPosition };
  }

  for (const capturedId of outcome.captured) {
    const capturedPiece = state.pieces[capturedId];
    if (!capturedPiece) continue;
    if (capturedPiece.position) {
      delete state.board[coordKey(capturedPiece.position)];
    }
    capturedPiece.status = "captured";
    capturedPiece.position = null;
    const capturingPlayer: PlayerColor = capturedPiece.owner === "black" ? "white" : "black";
    state.captures[capturingPlayer] += 1;
  }
};

const evaluateGameCompletion = (state: GameState): boolean => {
  const activeBlack = countActivePieces(state, "black");
  const activeWhite = countActivePieces(state, "white");

  if (activeBlack > 0 && activeWhite > 0) {
    return false;
  }

  const blackScore = state.scores.black;
  const whiteScore = state.scores.white;
  let winner: PlayerColor | undefined;
  let tie = false;

  if (blackScore > whiteScore) {
    winner = "black";
  } else if (whiteScore > blackScore) {
    winner = "white";
  } else {
    const blackCaptures = state.captures.black;
    const whiteCaptures = state.captures.white;
    if (blackCaptures > whiteCaptures) {
      winner = "black";
    } else if (whiteCaptures > blackCaptures) {
      winner = "white";
    } else {
      tie = true;
    }
  }

  state.phase = "completed";
  state.winner = winner;
  state.tie = tie;
  state.updatedAt = Date.now();
  return true;
};

export const countActivePieces = (state: GameState, color: PlayerColor): number =>
  Object.values(state.pieces).filter(
    (piece) => piece.owner === color && piece.status === "active" && piece.position
  ).length;

export const getLegalMovesForPiece = (
  state: GameState,
  pieceId: string
): ValidationResult<LegalMove[]> => {
  const piece = state.pieces[pieceId];
  if (!piece || piece.status !== "active" || !piece.position) {
    return { ok: false, error: "Piece is not movable" };
  }
  if (state.turn !== piece.owner) {
    return { ok: false, error: "Not this piece's turn" };
  }
  const moves: LegalMove[] = [];
  const from = piece.position;

  for (let dRow = -1; dRow <= 1; dRow += 1) {
    for (let dCol = -1; dCol <= 1; dCol += 1) {
      if (dRow === 0 && dCol === 0) continue;
      const candidate: Coord = { row: from.row + dRow, col: from.col + dCol };
      const move: MoveCommand = { pieceId, to: candidate };
      const simulation = simulateMove(state, move);
      if (simulation.ok) {
        moves.push({
          to: candidate,
          scored: simulation.value.scored
        });
      }
    }
  }

  return { ok: true, value: moves };
};

const hasAnyLegalMove = (state: GameState, color: PlayerColor): boolean => {
  const activePieces = Object.values(state.pieces).filter(
    (piece) =>
      piece.owner === color && piece.status === "active" && piece.position && state.turnOrigins[piece.id]
  );

  for (const piece of activePieces) {
    const legal = getLegalMovesForPiece(state, piece.id);
    if (legal.ok && legal.value.length > 0) {
      return true;
    }
  }

  return false;
};
