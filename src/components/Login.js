import { useRef, useState } from "react";
import { useAuth } from "../contexts/Auth";

export function Login() {
  const emailRef = useRef();
  const [submitted, setSubmitted] = useState(false);

  const { signIn } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();

    // Get email and password input values
    const email = emailRef.current.value;

    // Calls `signIn` function from the context
    const { error } = await signIn({ email });

    if (error) {
      alert("error signing in");
    } else {
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div>
        <h1>Please check your email to sign in</h1>
      </div>
    );
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
