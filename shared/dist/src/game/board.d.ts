import type { PlayerColor } from "../types";
export interface Coord {
    row: number;
    col: number;
}
export type CoordKey = `${number},${number}`;
export declare const coordKey: (coord: Coord) => CoordKey;
export declare const parseCoordKey: (key: CoordKey) => Coord;
export declare const isInsideBoard: (coord: Coord) => boolean;
export declare const isSetupRow: (coord: Coord, player: PlayerColor) => boolean;
export declare const isScoringMove: (from: Coord, to: Coord, player: PlayerColor) => boolean;
export declare const adjacentCoords: (coord: Coord) => Coord[];
export declare const equalCoord: (a: Coord | null | undefined, b: Coord | null | undefined) => boolean;
//# sourceMappingURL=board.d.ts.map