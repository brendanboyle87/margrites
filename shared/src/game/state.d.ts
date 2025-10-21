import type { GameState, MoveCommand, PlayerColor, SetupState } from "../types";
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
interface SimulationOutcome extends MoveResolution {
    newPosition: Coord | null;
}
export declare const createEmptyGame: (id: string) => GameState;
export declare const createEmptySetupState: () => SetupState;
export declare const resetSetupState: (state: GameState) => void;
export declare const setSetupPositions: (state: GameState, color: PlayerColor, positions: Coord[]) => ValidationResult<void>;
export declare const setSetupReady: (state: GameState, color: PlayerColor, ready: boolean) => ValidationResult<void>;
export declare const canStartGame: (state: GameState) => ValidationResult<void>;
export declare const startGameFromSetup: (state: GameState) => ValidationResult<void>;
export declare const beginTurn: (state: GameState, color: PlayerColor) => void;
export declare const switchTurn: (state: GameState) => void;
export declare const applyMove: (state: GameState, player: PlayerColor, command: MoveCommand) => ValidationResult<{
    outcome: SimulationOutcome;
    turnEnded: boolean;
}>;
export declare const countActivePieces: (state: GameState, color: PlayerColor) => number;
export declare const getLegalMovesForPiece: (state: GameState, pieceId: string) => ValidationResult<LegalMove[]>;
export {};
