import { BOARD_COLUMNS, BOARD_ROWS } from "./constants";
import type { PlayerColor } from "../types";

export interface Coord {
  row: number;
  col: number;
}

export type CoordKey = `${number},${number}`;

export const coordKey = (coord: Coord): CoordKey => `${coord.row},${coord.col}`;

export const parseCoordKey = (key: CoordKey): Coord => {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
};

export const isInsideBoard = (coord: Coord): boolean =>
  coord.row >= 0 && coord.row < BOARD_ROWS && coord.col >= 0 && coord.col < BOARD_COLUMNS;

export const isSetupRow = (coord: Coord, player: PlayerColor): boolean => {
  if (!isInsideBoard(coord)) return false;
  return player === "black" ? coord.row <= 1 : coord.row >= BOARD_ROWS - 2;
};

export const isScoringMove = (from: Coord, to: Coord, player: PlayerColor): boolean => {
  // Scoring requires advancing vertically off the opponent's edge.
  if (player === "black") {
    return from.row === BOARD_ROWS - 1 && to.row === BOARD_ROWS && to.col === from.col;
  }
  return from.row === 0 && to.row === -1 && to.col === from.col;
};

export const adjacentCoords = (coord: Coord): Coord[] => {
  const result: Coord[] = [];
  for (let dRow = -1; dRow <= 1; dRow += 1) {
    for (let dCol = -1; dCol <= 1; dCol += 1) {
      if (dRow === 0 && dCol === 0) continue;
      const candidate = { row: coord.row + dRow, col: coord.col + dCol };
      if (isInsideBoard(candidate)) {
        result.push(candidate);
      }
    }
  }
  return result;
};

export const equalCoord = (a: Coord | null | undefined, b: Coord | null | undefined): boolean => {
  if (!a || !b) return false;
  return a.row === b.row && a.col === b.col;
};
