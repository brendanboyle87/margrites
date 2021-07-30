import { useHistory } from "react-router";
import { Link } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";
import { useAuth } from "../contexts/Auth";
import { useRef, useState, useEffect } from "react";

export function Lobby() {
  const gameIdRef = useRef();

  // Get current user and signOut function from context
  const { user, signOut } = useAuth();

  const { supabase } = useAppContext();

  const history = useHistory();
  const randomWords = require("random-words");

  const [activeGames, setActiveGames] = useState([]);

  useEffect(() => {
    supabase
      .from("game")
      .select("game_id")
      .or(`player_one.eq.${user.id},player_two.eq.${user.id}`)
      .then((response) => response)
      .then((response) => setActiveGames(response.data));
  }, [supabase, user.id, activeGames]);

  async function handleSignOut() {
    // Ends user session
    await signOut();

    // Redirects the user to Login page
    history.push("/login");
  }

  async function handleCreateGame() {
    const gameState = {
      captures: { playerOne: 0, playerTwo: 0 },
      points: { playerOne: 0, playerTwo: 0 },
      isPlayerOnesTurn: false,
      isSetupPhase: true,
      board: Array(8)
        .fill()
        .map((x) => Array(9).fill("+")),
    };

    const gameId = randomWords({
      exactly: 1,
      wordsPerString: 3,
      separator: "-",
    })[0];

    const game = {
      is_complete: false,
      player_one: user.id,
      game_state: gameState,
      game_id: gameId,
    };

    const { data, error } = await supabase.from("game").insert([game]);

    if (data) {
      history.push(`/game/${gameId}`);
    }
  }

  async function handleJoinGame(e) {
    e.preventDefault();

    // Get email and password input values
    const gameId = gameIdRef.current.value;
    const { data, error } = await supabase
      .from("game")
      .update({ player_two: user.id });
    if (data) {
      history.push(`/game/${gameId}`);
    } else {
      console.log(error);
    }
  }

  return (
    <div className="h-screen bg-white grid grid-cols-2 justify-items-center gap-2">
      <div>
        <button
          className="btn btn-blue space-y-5 mt-5"
          onClick={handleCreateGame}
        >
          Create Game
        </button>

        <form onSubmit={handleJoinGame} className="space-y-5 mt-10">
          <input
            type="text"
            className="w-full h-12 border border-gray-800 rounded px-3"
            placeholder="Game Id"
            ref={gameIdRef}
          />

          <button className="btn btn-blue">Join Game</button>
        </form>

        <button
          className="btn btn-blue space-y-5 mt-10"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </div>

      <div>
        <h1 className="my-5">Active Games</h1>
        <ul>
          {activeGames
            ? Array.from(activeGames).map((game) => (
                <Link
                  className="underline py-3 text-blue-400"
                  to={"/game/" + game.game_id}
                >
                  {game.game_id}
                </Link>
              ))
            : "No Active Games"}
        </ul>
      </div>
    </div>
  );
}
