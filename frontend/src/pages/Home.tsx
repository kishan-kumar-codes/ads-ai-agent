import { Link } from "react-router-dom";
import { useSession } from "../lib/auth-client";

export function HomePage() {
  const { data } = useSession();
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">AI Marketing Agent</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">
        Plan, launch, and optimize Google &amp; Meta ad campaigns through a chat
        interface.
      </p>
      <div className="mt-6 flex gap-3">
        {data?.user ? (
          <Link
            to="/chat"
            className="rounded-md bg-brand px-4 py-2 text-white hover:bg-brand-dark"
          >
            Open chat
          </Link>
        ) : (
          <>
            <Link
              to="/signup"
              className="rounded-md bg-brand px-4 py-2 text-white hover:bg-brand-dark"
            >
              Get started
            </Link>
            <Link
              to="/signin"
              className="rounded-md border border-slate-300 px-4 py-2 dark:border-slate-700"
            >
              Sign in
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
