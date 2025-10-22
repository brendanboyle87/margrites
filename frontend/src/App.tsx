import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  PIECES_PER_SIDE,
  coordKey,
  getLegalMovesForPiece,
  isSetupRow,
  type ClientMessage,
  type GameBroadcast,
  type GameState,
  type LegalMove,
  type PlayerColor,
  type ServerMessage
} from "@margrites/shared";
import { useEffect, useMemo, useRef, useState } from "react";

type Role = "black" | "white" | "spectator" | undefined;

export function App() {
  const [gameIdInput, setGameIdInput] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>();
  const [status, setStatus] = useState("");
  const [broadcast, setBroadcast] = useState<GameBroadcast | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<LegalMove[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!broadcast || !selectedPiece) {
      setLegalMoves([]);
      return;
    }
    if (broadcast.state.phase !== "in-progress") {
      setLegalMoves([]);
      return;
    }
    if (!role || role !== broadcast.state.turn) {
      setLegalMoves([]);
      return;
    }
    const piece = broadcast.state.pieces[selectedPiece];
    if (!piece || piece.owner !== role || piece.status !== "active") {
      setSelectedPiece(null);
      setLegalMoves([]);
      return;
    }
    const legal = getLegalMovesForPiece(broadcast.state, selectedPiece);
    if (legal.ok) {
      setLegalMoves(legal.value);
    } else {
      setLegalMoves([]);
    }
  }, [broadcast, role, selectedPiece]);

  const sendMessage = (payload: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus("Connection is not ready");
      return;
    }
    socket.send(JSON.stringify(payload));
  };

  const connectToGame = (targetGameId: string) => {
    const trimmedName = playerName.trim();
    const trimmedId = targetGameId.trim();
    if (!trimmedName) {
      setStatus("Enter your name before joining a game");
      return;
    }
    if (!trimmedId) {
      setStatus("Enter a game ID to join");
      return;
    }

    setGameIdInput(trimmedId);
    socketRef.current?.close();
    setStatus("Connecting…");
    setBroadcast(null);
    setSelectedPiece(null);
    setLegalMoves([]);

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("Connected");
      const joinMessage: ClientMessage = {
        type: "join",
        gameId: trimmedId,
        name: trimmedName
      };
      socket.send(JSON.stringify(joinMessage));
    };

    socket.onmessage = (event) => {
      const parsed: ServerMessage = JSON.parse(event.data);
      switch (parsed.type) {
        case "ack":
          setConnectionId(parsed.connectionId);
          setRole(parsed.role);
          break;
        case "state":
          setBroadcast(parsed.payload);
          break;
        case "info":
          setMessages((prev) => [parsed.message, ...prev].slice(0, 10));
          break;
        case "error":
          setStatus(parsed.message);
          setMessages((prev) => [`Error: ${parsed.message}`, ...prev].slice(0, 10));
          break;
        default:
          break;
      }
    };

    socket.onclose = () => {
      setStatus("Disconnected");
      setRole(undefined);
      setConnectionId(null);
      setBroadcast(null);
      setSelectedPiece(null);
      setLegalMoves([]);
    };

    socket.onerror = () => {
      setStatus("Connection error");
    };
  };

  const handleConnect = () => {
    connectToGame(gameIdInput);
  };

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      setStatus("Enter your name before creating a game");
      return;
    }
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        throw new Error("Failed to create game");
      }
      const { id } = await response.json();
      setStatus(`Created game ${id}. Connecting…`);
      connectToGame(id);
    } catch (error) {
      console.error(error);
      setStatus("Unable to create game");
    }
  };

  const setupMap = useMemo(() => {
    if (!broadcast) {
      return {
        black: new Set<string>(),
        white: new Set<string>()
      };
    }
    return {
      black: new Set(broadcast.state.setup.positions.black.map(coordKey)),
      white: new Set(broadcast.state.setup.positions.white.map(coordKey))
    };
  }, [broadcast]);

  const boardTargets = useMemo(() => {
    const targets = new Set<string>();
    legalMoves
      .filter((move) => !move.scored)
      .forEach((move) => targets.add(coordKey(move.to)));
    return targets;
  }, [legalMoves]);

  const scoringOptions = useMemo(() => legalMoves.filter((move) => move.scored), [legalMoves]);

  const getPieceIdAt = (state: GameState, row: number, col: number): string | null => {
    const key = coordKey({ row, col });
    const pieceId = state.board[key];
    return pieceId ?? null;
  };

  const handleSetupCellClick = (row: number, col: number) => {
    if (!broadcast || broadcast.state.phase !== "setup") return;
    if (!role || role === "spectator") return;
    const coord = { row, col };
    if (!isSetupRow(coord, role)) return;

    const existing = broadcast.state.setup.positions[role];
    const hasCoord = existing.some((c) => c.row === row && c.col === col);
    let next: typeof existing;
    if (hasCoord) {
      next = existing.filter((c) => !(c.row === row && c.col === col));
    } else {
      if (existing.length >= PIECES_PER_SIDE) {
        setStatus(`You may only place ${PIECES_PER_SIDE} pieces`);
        return;
      }
      next = [...existing, coord];
    }
    sendMessage({ type: "updateSetup", positions: next });
  };

  const handleToggleReady = (ready: boolean) => {
    if (!broadcast || broadcast.state.phase !== "setup") return;
    if (!role || role === "spectator") return;
    if (ready && broadcast.state.setup.positions[role].length !== PIECES_PER_SIDE) {
      setStatus(`Place all ${PIECES_PER_SIDE} pieces before readying`);
      return;
    }
    sendMessage({ type: "setReady", ready });
  };

  const handleClearSetup = () => {
    if (!broadcast || broadcast.state.phase !== "setup") return;
    if (!role || role === "spectator") return;
    sendMessage({ type: "updateSetup", positions: [] });
  };

  const handleBoardCellClick = (row: number, col: number) => {
    if (!broadcast) return;
    if (broadcast.state.phase === "setup") {
      handleSetupCellClick(row, col);
      return;
    }
    if (broadcast.state.phase !== "in-progress") return;
    if (!role || role === "spectator") return;

    const pieceId = getPieceIdAt(broadcast.state, row, col);

    if (pieceId) {
      const piece = broadcast.state.pieces[pieceId];
      if (piece.owner === role && piece.status === "active") {
        if (role !== broadcast.state.turn) return;
        setSelectedPiece((prev) => (prev === pieceId ? null : pieceId));
        return;
      }
    }

    if (!selectedPiece) return;
    const targetKey = coordKey({ row, col });
    if (!boardTargets.has(targetKey)) return;

    sendMessage({
      type: "makeMove",
      move: { pieceId: selectedPiece, to: { row, col } }
    });
    setSelectedPiece(null);
    setLegalMoves([]);
  };

  const handleScoreMove = (move: LegalMove) => {
    if (!selectedPiece) return;
    sendMessage({
      type: "makeMove",
      move: { pieceId: selectedPiece, to: move.to }
    });
    setSelectedPiece(null);
    setLegalMoves([]);
  };

  const currentTurnLabel = broadcast
    ? `${broadcast.state.turn === "black" ? "Black" : "White"} to move`
    : "Awaiting game state";

  const readyStates = broadcast
    ? (["black", "white"] as PlayerColor[]).map((color) => ({
        color,
        ready: broadcast.state.setup.ready[color],
        count: broadcast.state.setup.positions[color].length
      }))
    : [];

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>Margrites Online</h1>
        <div className="connection-status">
          <span>{status}</span>
          {connectionId && <span className="connection-id">Connection: {connectionId}</span>}
        </div>
      </header>

      <section className="lobby">
        <div className="input-group">
          <label htmlFor="player-name">Name</label>
          <input
            id="player-name"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="Enter your name"
          />
        </div>
        <div className="input-group">
          <label htmlFor="game-id">Game ID</label>
          <input
            id="game-id"
            value={gameIdInput}
            onChange={(event) => setGameIdInput(event.target.value)}
            placeholder="Paste or generate a game ID"
          />
        </div>
        <div className="button-row">
          <button onClick={handleCreateGame}>Create Game</button>
          <button onClick={handleConnect}>Join Game</button>
        </div>
        {role && (
          <div className="role-banner">
            You are playing as <strong>{role}</strong>.
          </div>
        )}
      </section>

      <main className="main-layout">
        <section className="board-wrapper">
          <div className="turn-indicator">{currentTurnLabel}</div>
          <BoardView
            broadcast={broadcast}
            role={role}
            selectedPiece={selectedPiece}
            boardTargets={boardTargets}
            onCellClick={handleBoardCellClick}
            setupMap={setupMap}
          />
          {broadcast?.state.phase === "setup" && role && role !== "spectator" && (
            <div className="setup-controls">
              <div>
                You have placed {broadcast.state.setup.positions[role].length}/{PIECES_PER_SIDE} pieces.
              </div>
              <div className="button-row">
                <button onClick={() => handleToggleReady(!broadcast.state.setup.ready[role])}>
                  {broadcast.state.setup.ready[role] ? "Cancel Ready" : "Ready Up"}
                </button>
                <button onClick={handleClearSetup}>Clear Setup</button>
              </div>
            </div>
          )}
          {broadcast?.state.phase === "in-progress" && role === broadcast.state.turn && selectedPiece && (
            <ScoringActions moves={scoringOptions} onScore={handleScoreMove} />
          )}
        </section>

        <aside className="sidebar">
          {broadcast ? (
            <>
              <Scoreboard state={broadcast.state} />
              <SetupStatus readyStates={readyStates} />
            </>
          ) : (
            <p className="sidebar-empty">Join a game to see details.</p>
          )}
          <Log messages={messages} />
        </aside>
      </main>
    </div>
  );
}

interface BoardViewProps {
  broadcast: GameBroadcast | null;
  role: Role;
  selectedPiece: string | null;
  boardTargets: Set<string>;
  onCellClick: (row: number, col: number) => void;
  setupMap: { black: Set<string>; white: Set<string> };
}

const BoardView = ({
  broadcast,
  role,
  selectedPiece,
  boardTargets,
  onCellClick,
  setupMap
}: BoardViewProps) => {
  const phase = broadcast?.state.phase ?? "lobby";

  const getOccupant = (row: number, col: number) => {
    if (!broadcast) return { color: undefined, kind: "empty" as const, pieceId: null };
    if (phase === "setup") {
      const key = coordKey({ row, col });
      if (setupMap.black.has(key)) return { color: "black" as PlayerColor, kind: "setup", pieceId: null };
      if (setupMap.white.has(key)) return { color: "white" as PlayerColor, kind: "setup", pieceId: null };
      return { color: undefined, kind: "empty" as const, pieceId: null };
    }
    const pieceId = broadcast.state.board[coordKey({ row, col })];
    if (!pieceId) return { color: undefined, kind: "empty" as const, pieceId: null };
    const piece = broadcast.state.pieces[pieceId];
    if (!piece || piece.status !== "active") return { color: undefined, kind: "empty" as const, pieceId: null };
    return { color: piece.owner, kind: "active" as const, pieceId };
  };

  const rowOrder =
    role === "white"
      ? Array.from({ length: BOARD_ROWS }, (_, index) => index)
      : Array.from({ length: BOARD_ROWS }, (_, index) => BOARD_ROWS - 1 - index);

  const colOrder =
    role === "white"
      ? Array.from({ length: BOARD_COLUMNS }, (_, index) => BOARD_COLUMNS - 1 - index)
      : Array.from({ length: BOARD_COLUMNS }, (_, index) => index);

  const rows = [];
  for (const row of rowOrder) {
    const cells = [];
    for (const col of colOrder) {
      const { color, kind, pieceId } = getOccupant(row, col);
      const key = coordKey({ row, col });
      const isSelected = pieceId && pieceId === selectedPiece;
      const isTarget = boardTargets.has(key);
      const isSetupZone = row <= 1 || row >= BOARD_ROWS - 2;
      const cellClass = [
        "board-cell",
        isTarget ? "target" : "",
        isSelected ? "selected" : "",
        color ? `owner-${color}` : "",
        kind === "setup" ? "setup-piece" : "",
        isSetupZone ? "setup-zone" : ""
      ]
        .join(" ")
        .trim();
      const label = `${String.fromCharCode(97 + col)}${row + 1}`;
      cells.push(
        <button key={key} className={cellClass} onClick={() => onCellClick(row, col)} title={label}>
          {color ? (color === "black" ? "B" : "W") : ""}
        </button>
      );
    }
    rows.push(
      <div key={row} className="board-row">
        {cells}
      </div>
    );
  }

  const orientationHint =
    role === "white"
      ? "White view: your pieces start at the bottom; advance toward the top edge to score."
      : role === "black"
      ? "Black view: your pieces start at the bottom; advance toward the top edge to score."
      : "Spectator view: Black home rows at the bottom, White at the top.";

  return (
    <div className="board-section">
      <div className="board-grid">{rows}</div>
      <div className="orientation-hint">{orientationHint}</div>
    </div>
  );
};

const Scoreboard = ({ state }: { state: GameState }) => (
  <div className="scoreboard">
    <h2>Scoreboard</h2>
    <div className="score-row">
      <span>Black</span>
      <span>
        {state.scores.black} pts · {state.captures.black} captures · {countActive(state, "black")} pieces on board
      </span>
    </div>
    <div className="score-row">
      <span>White</span>
      <span>
        {state.scores.white} pts · {state.captures.white} captures · {countActive(state, "white")} pieces on board
      </span>
    </div>
    {state.phase === "completed" && (
      <div className="score-result">
        {state.tie
          ? "Result: Tie game."
          : state.winner
          ? `Result: ${state.winner === "black" ? "Black" : "White"} wins.`
          : "Result: Game complete."}
      </div>
    )}
  </div>
);

const countActive = (state: GameState, color: PlayerColor): number =>
  Object.values(state.pieces).filter(
    (piece) => piece.owner === color && piece.status === "active" && piece.position
  ).length;

const SetupStatus = ({
  readyStates
}: {
  readyStates: { color: PlayerColor; ready: boolean; count: number }[];
}) => (
  <div className="setup-status">
    <h2>Setup Status</h2>
    {readyStates.map(({ color, ready, count }) => (
      <div key={color} className="setup-row">
        <span>{color === "black" ? "Black" : "White"}</span>
        <span>
          {count}/{PIECES_PER_SIDE} pieces · {ready ? "Ready" : "Not Ready"}
        </span>
      </div>
    ))}
  </div>
);

const Log = ({ messages }: { messages: string[] }) => (
  <div className="log">
    <h2>Event Log</h2>
    {messages.length === 0 ? (
      <p className="log-empty">No events yet.</p>
    ) : (
      <ul>
        {messages.map((message, index) => (
          <li key={`${message}-${index}`}>{message}</li>
        ))}
      </ul>
    )}
  </div>
);

const ScoringActions = ({ moves, onScore }: { moves: LegalMove[]; onScore: (move: LegalMove) => void }) => {
  if (moves.length === 0) return null;
  return (
    <div className="scoring-actions">
      <h3>Scoring Options</h3>
      {moves.map((move, index) => (
        <button key={index} onClick={() => onScore(move)}>
          Score piece
        </button>
      ))}
    </div>
  );
};
