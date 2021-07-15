import { useRef, useState } from "react";

export function Login() {
  const emailRef = useRef();

  async function handleSubmit(e) {
    e.preventDefault();

    // @TODO: add login logic
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
