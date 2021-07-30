/* eslint-disable react-hooks/exhaustive-deps */
import { useParams } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";
import { useEffect, useState } from "react";

export function Game() {
  const { supabase } = useAppContext();

  const { gameId } = useParams();

  const [currentGame, setGame] = useState({});

  const [gameListener, setGameListener] = useState(null);

  function handleNewGame(newGame) {
    setGame(newGame);
  }

  useEffect(() => {
    supabase
      .from("game")
      .select("*")
      .eq("game_id", gameId)
      .then((response) => response.data[0])
      .then((response) => setGame(response));
  }, []);

  useEffect(() => {
    if (!gameListener && currentGame) {
      setGameListener(
        supabase
          .from(`game:id=eq.${currentGame.id}`)
          .on("UPDATE", (payload) => handleNewGame(payload.new))
          .subscribe()
      );
    }
  }, [currentGame, gameListener]);

  return (
    <div>
      ${JSON.stringify(currentGame)}
      <p>{currentGame.player_two || "Waiting for player two"}</p>
      <div></div>
    </div>
  );
}
