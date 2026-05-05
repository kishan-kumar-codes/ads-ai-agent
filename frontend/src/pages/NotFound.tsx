import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-md text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        That route doesn’t exist.
      </p>
      <Link to="/" className="mt-4 inline-block text-brand hover:underline">
        Go home
      </Link>
    </section>
  );
}
