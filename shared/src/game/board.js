import { BOARD_COLUMNS, BOARD_ROWS } from "./constants";
export const coordKey = (coord) => `${coord.row},${coord.col}`;
export const parseCoordKey = (key) => {
    const [row, col] = key.split(",").map(Number);
    return { row, col };
};
export const isInsideBoard = (coord) => coord.row >= 0 && coord.row < BOARD_ROWS && coord.col >= 0 && coord.col < BOARD_COLUMNS;
export const isSetupRow = (coord, player) => {
    if (!isInsideBoard(coord))
        return false;
    return player === "black" ? coord.row <= 1 : coord.row >= BOARD_ROWS - 2;
};
export const isScoringMove = (from, to, player) => {
    // Scoring requires advancing vertically off the opponent's edge.
    if (player === "black") {
        return from.row === BOARD_ROWS - 1 && to.row === BOARD_ROWS && to.col === from.col;
    }
    return from.row === 0 && to.row === -1 && to.col === from.col;
};
export const adjacentCoords = (coord) => {
    const result = [];
    for (let dRow = -1; dRow <= 1; dRow += 1) {
        for (let dCol = -1; dCol <= 1; dCol += 1) {
            if (dRow === 0 && dCol === 0)
                continue;
            const candidate = { row: coord.row + dRow, col: coord.col + dCol };
            if (isInsideBoard(candidate)) {
                result.push(candidate);
            }
        }
    }
    return result;
};
export const equalCoord = (a, b) => {
    if (!a || !b)
        return false;
    return a.row === b.row && a.col === b.col;
};
