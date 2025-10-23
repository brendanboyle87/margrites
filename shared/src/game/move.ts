import type { Coord } from "./board";

export interface LegalMove {
  to: Coord;
  scored: boolean;
}

export interface MoveResolution {
  pieceId: string;
  from: Coord;
  to: Coord | null;
  scored: boolean;
  captured: string[];
}
