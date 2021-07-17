import { useRef } from "react";
import { useAuth } from "../contexts/Auth";
import { useHistory } from "react-router-dom";

export function Login() {
  const emailRef = useRef();

  const { signIn } = useAuth();

  const history = useHistory();

  async function handleSubmit(e) {
    e.preventDefault();

    // Get email and password input values
    const email = emailRef.current.value;

    // Calls `signIn` function from the context
    const { error } = await signIn({ email });

    if (error) {
      alert("error signing in");
    } else {
      // Redirect user to Dashboard
      history.push("/");
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <label htmlFor="input-email">Email</label>
        <input id="input-email" type="email" ref={emailRef} />

        <br />

        <button type="submit">Login with magic link</button>
      </form>
    </>
  );
}
