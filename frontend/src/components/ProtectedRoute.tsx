import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../lib/auth-client";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  if (!data?.user) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
