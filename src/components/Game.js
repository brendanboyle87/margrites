/* eslint-disable react-hooks/exhaustive-deps */
import { useParams } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";
import { useEffect, useState } from "react";

export function Game() {
  const { supabase } = useAppContext();

  const { gameId } = useParams();

  const [currentGame, setGame] = useState(null);

  const [loading, setLoading] = useState(true);

  function handleNewGame(newGame) {
    setGame(newGame);
  }

  function loadGame(game) {
    setGame(game);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    supabase
      .from("game")
      .select("*")
      .eq("game_id", gameId)
      .then((response) => response.data[0])
      .then((response) => loadGame(response));
  }, []);

  useEffect(() => {
    if (currentGame) {
      supabase
        .from(`game:id=eq.${currentGame.id}`)
        .on("UPDATE", (payload) => handleNewGame(payload.new))
        .subscribe();
    }
  }, []);

  return (
    <div className="h-screen bg-white grid grid-cols-5">
      <div className="col-span-3">test</div>
      <div className="col-span-2">
        {loading ? (
          <p>Loading</p>
        ) : (
          <div>
            <p>{currentGame.player_two || "Waiting for player two"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
