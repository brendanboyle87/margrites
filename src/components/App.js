import { BrowserRouter as Router, Switch, Route } from "react-router-dom";

import { Login } from "./Login";
import { Lobby } from "./Lobby";

export default function App() {
  return (
    <div>
      <h1>Margrites</h1>
      <Router>
        <Switch>
          <Route exact path="/" component={Lobby} />
          <Route path="/login" component={Login} />
        </Switch>
      </Router>
    </div>
  );
}
