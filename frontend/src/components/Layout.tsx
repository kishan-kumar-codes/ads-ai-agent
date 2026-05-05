import { Link, NavLink, Outlet } from "react-router-dom";
import { useSession, signOut } from "../lib/auth-client";
import { useTheme } from "../store/theme";
import { ToastViewport } from "./Toast";

export function Layout() {
  const { data: session, isPending } = useSession();
  const { theme, toggle } = useTheme();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:block">
        <Link to="/" className="block text-lg font-semibold text-brand">
          AI Marketing Agent
        </Link>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <NavItem to="/">Home</NavItem>
          {session?.user && <NavItem to="/chat">Chats</NavItem>}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
          <Link to="/" className="text-base font-semibold md:hidden">
            AI Marketing Agent
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="rounded-md border border-slate-300 px-3 py-1 dark:border-slate-700"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            {isPending ? (
              <span className="text-slate-500">…</span>
            ) : session?.user ? (
              <>
                <span className="text-slate-600 dark:text-slate-300">
                  {session.user.email}
                </span>
                <button
                  onClick={() => signOut()}
                  className="rounded-md bg-slate-900 px-3 py-1 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/signin" className="hover:underline">
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-md bg-brand px-3 py-1 text-white hover:bg-brand-dark"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
        <ToastViewport />
      </div>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `rounded-md px-3 py-2 ${
          isActive
            ? "bg-brand/10 text-brand"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
