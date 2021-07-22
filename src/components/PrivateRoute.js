import React from "react";
import { Route } from "react-router-dom";

import { useAuth } from "../contexts/Auth";
import { Login } from "./Login";

export function PrivateRoute({ component: Component, ...rest }) {
  const { user } = useAuth();

  return (
    <Route
      {...rest}
      render={(props) => {
        // Renders the page only if `user` is present (user is authenticated)
        // Otherwise, redirect to the login page
        return user ? <Component {...props} /> : <Login />;
      }}
    ></Route>
  );
}
