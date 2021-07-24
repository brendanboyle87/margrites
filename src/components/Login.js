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
      <div className="shadow-lg rounded-2xl p-4 bg-white dark:bg-gray-900 w-64 m-auto relative">
        <div className="w-full h-full text-center">
          <div className="flex h-full flex-col justify-center">
            <svg
              className="mx-auto"
              xmlns="http://www.w3.org/2000/svg"
              id="body_1"
              width="100"
              height="75"
            >
              <g transform="matrix(0.09765625 0 0 0.09765625 0 0)">
                <g transform="matrix(1.5 0 0 1.5 128.00003 -0)"></g>
                <path
                  transform="matrix(1.5 0 0 1.5 128.00003 -0)"
                  d="M0 256C 0 114.615105 114.615105 0 256 0C 397.3849 0 512 114.615105 512 256C 512 397.3849 397.3849 512 256 512C 114.615105 512 0 397.3849 0 256z"
                  stroke="none"
                  fill="#334D5C"
                  fill-rule="nonzero"
                />
                <g transform="matrix(1.5 0 0 1.5 128.00003 -0)"></g>
                <path
                  transform="matrix(1.5 0 0 1.5 128.00003 -0)"
                  d="M104.65 192L230.85 289.08002C 247.44576 301.84573 270.55426 301.84573 287.15 289.08002L287.15 289.08002L413.35 192L293.93 97.91C 273.4399 81.770294 244.5601 81.770294 224.06999 97.91L224.06999 97.91L104.65 192z"
                  stroke="none"
                  fill="#F3B562"
                  fill-rule="nonzero"
                />
                <g transform="matrix(1.5 0 0 1.5 128.00003 -0)"></g>
                <path
                  transform="matrix(1.5 0 0 1.5 128.00003 -0)"
                  d="M176.1 176.92L341.91 176.92L341.91 401.34L176.1 401.34L176.1 176.92z"
                  stroke="none"
                  fill="#FFFAD5"
                  fill-rule="nonzero"
                />
                <g transform="matrix(1.5 0 0 1.5 128.00003 -0)"></g>
                <path
                  transform="matrix(1.5 0 0 1.5 128.00003 -0)"
                  d="M212.46 315.32L252.74 210.43001L267.74 210.43001L310.66998 315.32L294.82 315.32L282.58002 283.55002L238.72 283.55002L227.2 315.32L212.46 315.32zM242.73001 272.25L278.29 272.25L267.34 243.25C 264.00668 234.42334 261.52667 227.17334 259.9 221.5C 258.53845 228.30322 256.64944 234.98996 254.25 241.5z"
                  stroke="none"
                  fill="#F26101"
                  fill-rule="nonzero"
                />
                <g transform="matrix(1.5 0 0 1.5 128.00003 -0)"></g>
                <path
                  transform="matrix(1.5 0 0 1.5 128.00003 -0)"
                  d="M287.15 289.05C 270.55426 301.8157 247.44576 301.8157 230.84999 289.05L230.84999 289.05L104.65 192L104.65 396.72C 104.649994 414.79077 119.29923 429.44003 137.37 429.44L137.37 429.44L380.63 429.44C 398.70078 429.44003 413.35 414.7908 413.35 396.72L413.35 396.72L413.35 192L287.15 289.05z"
                  stroke="none"
                  fill="#E6E2AF"
                  fill-rule="nonzero"
                />
                <g transform="matrix(1.5 0 0 1.5 128.00003 -0)"></g>
                <path
                  transform="matrix(1.5 0 0 1.5 128.00003 -0)"
                  d="M232.06 321.46L115 420.63C 121.0493 426.29764 129.03049 429.4479 137.32 429.44L137.32 429.44L380.63 429.44C 388.93695 429.46164 396.93863 426.3103 403 420.63L403 420.63L286 321.46002C 270.4452 308.2532 247.61479 308.2532 232.06 321.46z"
                  stroke="none"
                  fill="#A7A37E"
                  fill-rule="nonzero"
                />
              </g>
            </svg>
            <p className="text-gray-900 dark:text-white text-lg mt-4">
              A magic link has been sent to your email.
            </p>
            <p className="dark:text-gray-50 text-gray-700 text-xs font-thin py-2 px-6">
              Please click the link to login.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="h-screen bg-white flex flex-col space-y-10 justify-center items-center">
      <div className="bg-white w-96 shadow-xl rounded p-5">
        <h1 className="text-3xl font-medium text-center">Margrites</h1>

        <form onSubmit={handleSubmit} className="space-y-5 mt-5">
          <input
            type="text"
            className="w-full h-12 border border-gray-800 rounded px-3"
            placeholder="Email"
            ref={emailRef}
          />

          <button className="text-center w-full bg-blue-900 rounded-md text-white py-3 font-medium">
            Sign in with Magic Link
          </button>
        </form>
      </div>
    </div>
  );
}
