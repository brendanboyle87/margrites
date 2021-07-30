import { BrowserRouter as Router, Switch, Route } from "react-router-dom";

import { Login } from "./Login";
import { Lobby } from "./Lobby";
import { AuthProvider } from "./../contexts/Auth";
import { PrivateRoute } from "./PrivateRoute";
import { AppContextProvider } from "../contexts/AppContext";
import { Game } from "./Game";

export default function App() {
  return (
    <div>
      <AppContextProvider>
        <Router>
          <AuthProvider>
            <Switch>
              <PrivateRoute exact path="/" component={Lobby} activeGames={[]} />
              <Route exact path="/login" component={Login} />
              <PrivateRoute exact path="/game/:gameId" component={Game} />
            </Switch>
          </AuthProvider>
        </Router>
      </AppContextProvider>
    </div>
  );
}
