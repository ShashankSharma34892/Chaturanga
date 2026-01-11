import { useState, useRef, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { Chess } from "chess.js";
import "./App.css";

import whitePawn from "./assets/wp.png";
import blackPawn from "./assets/bp.png";
import whiteRook from "./assets/wr.png";
import blackRook from "./assets/br.png";
import whiteKnight from "./assets/wn.png";
import blackKnight from "./assets/bn.png";
import whiteBishop from "./assets/wb.png";
import blackBishop from "./assets/bb.png";
import whiteKing from "./assets/wk.png";
import blackKing from "./assets/bk.png";
import whiteQueen from "./assets/wq.png";
import blackQueen from "./assets/bq.png";

import crown from "./assets/crown.png";

type Piece = {
  color: "White" | "Black";
  type: "Pawn" | "Rook" | "Knight" | "Bishop" | "Queen" | "King";
};

type Tile =
  `${"a" | "b" | "c" | "d" | "e" | "f" | "g" | "h"}${"1" | "2" | "3" | "4" | "5" | "6" | "7" | "8"}`;

type Board = Record<Tile, Piece | undefined>;

const INITIAL_BOARD: Board = {
  // white back rank
  a1: { color: "White", type: "Rook" },
  b1: { color: "White", type: "Knight" },
  c1: { color: "White", type: "Bishop" },
  d1: { color: "White", type: "Queen" },
  e1: { color: "White", type: "King" },
  f1: { color: "White", type: "Bishop" },
  g1: { color: "White", type: "Knight" },
  h1: { color: "White", type: "Rook" },

  // white pawns
  a2: { color: "White", type: "Pawn" },
  b2: { color: "White", type: "Pawn" },
  c2: { color: "White", type: "Pawn" },
  d2: { color: "White", type: "Pawn" },
  e2: { color: "White", type: "Pawn" },
  f2: { color: "White", type: "Pawn" },
  g2: { color: "White", type: "Pawn" },
  h2: { color: "White", type: "Pawn" },

  // black back rank
  a8: { color: "Black", type: "Rook" },
  b8: { color: "Black", type: "Knight" },
  c8: { color: "Black", type: "Bishop" },
  d8: { color: "Black", type: "Queen" },
  e8: { color: "Black", type: "King" },
  f8: { color: "Black", type: "Bishop" },
  g8: { color: "Black", type: "Knight" },
  h8: { color: "Black", type: "Rook" },

  // black pawns
  a7: { color: "Black", type: "Pawn" },
  b7: { color: "Black", type: "Pawn" },
  c7: { color: "Black", type: "Pawn" },
  d7: { color: "Black", type: "Pawn" },
  e7: { color: "Black", type: "Pawn" },
  f7: { color: "Black", type: "Pawn" },
  g7: { color: "Black", type: "Pawn" },
  h7: { color: "Black", type: "Pawn" },
};

function App() {
  const TILT = +10;

  const game = useRef(new Chess());
  const socketRef = useRef<Socket | null>(null);

  const [board, setBoard] = useState<Board>(INITIAL_BOARD);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<"White" | "Black">(
    "White",
  );
  const [legalTargets, setLegalTargets] = useState<Tile[]>([]);
  const [status, setStatus] = useState<string>("");
  const [myColor, setMyColor] = useState<
    "White" | "Black" | "Spectator" | null
  >(null);
  const [lastMove, setLastMove] = useState<{ from: Tile; to: Tile } | null>(
    null,
  );
  const [capturedByWhite, setCapturedByWhite] = useState<Piece[]>([]);
  const [capturedByBlack, setCapturedByBlack] = useState<Piece[]>([]);
  const [moveLog, setMoveLog] = useState<string[]>([]);

  const boardContainerRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const geomRef = useRef<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [moveLog]);

  useEffect(() => {
    if (!boardRef.current) return;
    if (!myColor) return;

    if (myColor === "Black") {
      boardRef.current.classList.add("flipped");
    } else {
      boardRef.current.classList.remove("flipped");
    }
  }, [myColor]);

  useEffect(() => {
    const socket = io("http://localhost:3001");
    socketRef.current = socket;

    socket.on("assignColor", (color: "White" | "Black" | "Spectator") => {
      console.log("Assigned color:", color);
      setMyColor(color);
    });

    socket.on("connect", () => {
      console.log("Connected:", socket.id);
      socket.emit("joinGame");
    });

    socket.on("move", ({ from, to }: { from: Tile; to: Tile }) => {
      console.log("Move from server:", from, "->", to);

      let move;
      try {
        move = game.current.move({ from, to, promotion: "q" });
      } catch (err) {
        console.log("Engine error on remote move:", err);
        return;
      }

      if (!move) {
        console.log("Engine rejected remote move");
        return;
      }

      setLastMove({ from, to });

      const mover = move.color === "w" ? "White" : "Black";
      setMoveLog((prev) => [...prev.slice(-19), `${mover}: ${move.san}`]);

      if (move.captured) {
        const capturedColor: Piece["color"] =
          mover === "White" ? "Black" : "White";

        const capturedPiece: Piece = {
          color: capturedColor,
          type: pieceTypeFromChar(move.captured),
        };

        if (capturedColor === "White") {
          setCapturedByBlack((prev) => [...prev, capturedPiece]);
        } else {
          setCapturedByWhite((prev) => [...prev, capturedPiece]);
        }
      }

      applyMove(from, to);

      setLegalTargets([]);
      setSelectedTile(null);
      setCurrentPlayer(game.current.turn() === "w" ? "White" : "Black");

      updateStatus();
    });

    socket.on("gameReset", () => {
      console.log("Game reset from server");
      localResetGame();
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  function localResetGame() {
    // reset engine
    game.current = new Chess();

    // reset board
    setBoard(INITIAL_BOARD);

    // reset UI state
    setCurrentPlayer("White");
    setSelectedTile(null);
    setLegalTargets([]);
    setLastMove(null);
    setCapturedByWhite([]);
    setCapturedByBlack([]);
    setMoveLog([]);
    setStatus("");
  }

  function resetGame() {
    // 2. tell server to broadcast to others
    socketRef.current?.emit("resetGame");
  }

  function updateStatus() {
    const g = game.current;

    if (!g) return;

    if (g.isCheckmate()) {
      const winner = g.turn() === "w" ? "Black" : "White";
      setStatus(`Checkmate – ${winner} wins`);
    } else if (g.isStalemate()) {
      setStatus("Stalemate – draw");
    } else if (g.isDraw()) {
      setStatus("Draw");
    } else if (g.isCheck()) {
      const side = g.turn() === "w" ? "White" : "Black";
      setStatus(`Check on ${side}`);
    } else {
      setStatus("");
    }
  }

  function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();

    geomRef.current = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const boardContainer = boardContainerRef.current;
    const geom = geomRef.current;

    if (!boardContainer || !geom) {
      console.log("boardContainer or geom is null. Bye.");
      return;
    }

    const { clientX, clientY } = e;

    const horizontal = (clientX - geom.left) / geom.width;
    const vertical = (clientY - geom.top) / geom.height;

    const rotateX = TILT / 2 - horizontal * TILT;
    const rotateY = vertical * TILT - TILT / 2;

    boardContainer.style.transform = `perspective(${geom.width + 600}px) rotateX(${rotateY}deg) rotateY(${rotateX}deg) scale3d(1, 1, 1)`;
  }

  function resetStyles(e: React.MouseEvent<HTMLDivElement>) {
    const boardContainer = boardContainerRef.current;

    if (!boardContainer) {
      console.log("boardContainer is null. Bye.");
      return;
    }

    boardContainer.style.transform = `perspective(${e.currentTarget.clientWidth + 600}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
  }

  function handleTileClick(e: React.MouseEvent<HTMLDivElement>) {
    console.log("CLICK", {
      tile: e.currentTarget.id,
      myColor,
      currentPlayer,
    });

    const currentTile = e.currentTarget.id as Tile;
    const piece = board[currentTile];

    /*    console.log(
      `${currentTile} ${piece ? `-> ${piece.color} ${piece.type}` : ""}`,
    );*/
    if (!myColor || myColor === "Spectator") {
      return;
    }
    if (currentPlayer !== myColor) {
      return;
    }

    if (!selectedTile) {
      if (piece && piece.color == currentPlayer) {
        setSelectedTile(currentTile);

        const moves = game.current.moves({
          square: currentTile,
          verbose: true,
        });

        setLegalTargets(moves.map((m) => m.to as Tile));
      }
      return;
    }

    if (currentTile === selectedTile) {
      setSelectedTile(null);
      setLegalTargets([]);
      return;
    }

    // attempt to move
    let move;
    try {
      move = game.current.move({
        from: selectedTile,
        to: currentTile,
        promotion: "q",
      });
    } catch (err) {
      console.log("Engine error on local move:", err);
      return;
    }

    if (!move) {
      console.log("Illegal move");
      return;
    }

    setLastMove({ from: selectedTile, to: currentTile });

    // log this move (SAN notation)
    const mover = move.color === "w" ? "White" : "Black";
    setMoveLog((prev) => [...prev.slice(-19), `${mover}: ${move.san}`]);

    if (move.captured) {
      const capturedColor: Piece["color"] =
        mover === "White" ? "Black" : "White";

      const capturedPiece: Piece = {
        color: capturedColor,
        type: pieceTypeFromChar(move.captured),
      };

      if (capturedColor === "White") {
        setCapturedByBlack((prev) => [...prev, capturedPiece]);
      } else {
        setCapturedByWhite((prev) => [...prev, capturedPiece]);
      }
    }

    applyMove(selectedTile, currentTile);

    socketRef.current?.emit("move", {
      from: selectedTile,
      to: currentTile,
    });

    setSelectedTile(null);
    setLegalTargets([]);

    setCurrentPlayer(game.current.turn() === "w" ? "White" : "Black");

    updateStatus();

    console.log("After move:");
    console.log("  engine turn:", game.current.turn());
    console.log("  currentPlayer state:", currentPlayer);
    console.log("  myColor:", myColor);
  }

  function getPieceImage(piece: Piece) {
    if (piece.color === "White") {
      switch (piece.type) {
        case "Pawn":
          return whitePawn;
        case "Rook":
          return whiteRook;
        case "Knight":
          return whiteKnight;
        case "Bishop":
          return whiteBishop;
        case "Queen":
          return whiteQueen;
        case "King":
          return whiteKing;
      }
    } else {
      switch (piece.type) {
        case "Pawn":
          return blackPawn;
        case "Rook":
          return blackRook;
        case "Knight":
          return blackKnight;
        case "Bishop":
          return blackBishop;
        case "Queen":
          return blackQueen;
        case "King":
          return blackKing;
      }
    }

    // fallback, shouldn't happen
    return "";
  }

  function pieceTypeFromChar(ch: string): Piece["type"] {
    switch (ch.toLowerCase()) {
      case "p":
        return "Pawn";
      case "n":
        return "Knight";
      case "b":
        return "Bishop";
      case "r":
        return "Rook";
      case "q":
        return "Queen";
      case "k":
        return "King";
      default:
        throw new Error(`Unknown captured piece type: ${ch}`);
    }
  }

  function applyMove(from: Tile, to: Tile) {
    setBoard((prev) => {
      const next = { ...prev };
      next[to] = next[from];
      next[from] = undefined;
      return next;
    });
  }

  let indox = 0;

  const myCapturedPieces =
    myColor === "White"
      ? capturedByWhite
      : myColor === "Black"
        ? capturedByBlack
        : [];

  const opponentCapturedPieces =
    myColor === "White"
      ? capturedByBlack
      : myColor === "Black"
        ? capturedByWhite
        : [];

  return (
    <>
      <div className="chapi">
        <div className="whose-turn-is-it-anyway">
          <div className={`crown ${currentPlayer}`} onClick={resetGame}>
            <img src={crown} alt="crown" />
          </div>

          <div className="status-line">
            {status || `${currentPlayer}'s Turn`}
          </div>
        </div>

        <div className="papi">
          <div className="log display">
            <div className="role-label">Move History</div>

            <div className="move-log-wrapper" ref={logRef}>
              <ul className="move-log">
                {moveLog.map((m, i) => (
                  <li key={i} className="log-line">
                    {`${m}`}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div
            className={`tilt-shell`}
            onMouseEnter={handleMouseEnter}
            onMouseMove={handleMouseMove}
            onMouseLeave={resetStyles}
          >
            <div ref={boardContainerRef} className={`board-container`}>
              <div ref={boardRef} className={`board`}>
                {Array.from({ length: 64 }, (_, i) => {
                  const fileIndex = i % 8;
                  const rankIndex = Math.floor(i / 8);

                  const tileColor =
                    (fileIndex + rankIndex) % 2 === 0 ? "white" : "black";

                  const tileName = `${"abcdefgh"[fileIndex]}${8 - rankIndex}`;

                  const piece = board[tileName];

                  const isSelected = selectedTile === tileName;
                  const isTarget = legalTargets.includes(tileName);
                  const isCapture =
                    isTarget && piece && piece.color !== currentPlayer;
                  const isLastFrom = lastMove?.from === tileName;
                  const isLastTo = lastMove?.to === tileName;

                  return (
                    <div
                      key={tileName}
                      id={tileName}
                      className={`tile ${tileColor}
                        ${isSelected ? "selected" : ""} 
                        ${isCapture ? "capture" : isTarget ? "target" : ""} 
                        ${isLastFrom || isLastTo ? "last-move" : ""}`}
                      onClick={handleTileClick}
                    >
                      {piece && (
                        <img
                          className="piece"
                          src={getPieceImage(piece)}
                          alt={`${piece.color} ${piece.type}`}
                          col={`${piece.color}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="sidemarkings l top">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="marking">
                    {"ABCDEFGH"[i]}
                  </div>
                ))}
              </div>
              <div className="sidemarkings n left">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="marking">
                    {8 - i}
                  </div>
                ))}
              </div>
              <div className="sidemarkings n right">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="marking">
                    {8 - i}
                  </div>
                ))}
              </div>
              <div className="sidemarkings l bottom">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="marking">
                    {"ABCDEFGH"[i]}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="capture display">
            <div className="black-capture">
              <span className="black-heading">Black's Captures</span>

              <div className="bcap">
                {opponentCapturedPieces.map((p, i) => (
                  <img
                    key={i}
                    className="cap-piece"
                    src={getPieceImage(p)}
                    alt={`${p.color} ${p.type}`}
                    col={`${p.color}`}
                  />
                ))}
              </div>
            </div>

            <div className="white-capture">
              <div className="wcap">
                {myCapturedPieces.map((p, i) => (
                  <img
                    key={i}
                    className="cap-piece"
                    src={getPieceImage(p)}
                    alt={`${p.color} ${p.type}`}
                    col={`${p.color}`}
                  />
                ))}
              </div>

              <span className="white-heading">White's Captures</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
