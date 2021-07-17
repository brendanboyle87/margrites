import { BrowserRouter as Router, Switch, Route } from "react-router-dom";

import { Login } from "./Login";
import { Lobby } from "./Lobby";
import { AuthProvider } from "./../contexts/Auth";
import { PrivateRoute } from "./PrivateRoute";

export default function App() {
  return (
    <div>
      <h1>Margrites</h1>
      <Router>
        <AuthProvider>
          <Switch>
            <PrivateRoute exact path="/" component={Lobby} />
            <Route path="/login" component={Login} />
          </Switch>
        </AuthProvider>
      </Router>
    </div>
  );
}
