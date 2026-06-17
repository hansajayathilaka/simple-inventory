import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";

// Guards a route: requires authentication, and optionally the owner role.
export default function ProtectedRoute({
  children,
  ownerOnly = false,
}: {
  children: ReactNode;
  ownerOnly?: boolean;
}) {
  const { isAuthenticated, isOwner } = useAuth();
  const location = useLocation();

  if (!isAuthenticated)
    return <Navigate to="/login" replace state={{ from: location }} />;

  if (ownerOnly && !isOwner)
    return (
      <div className="card">
        <h2>Not allowed</h2>
        <p>This area is restricted to the shop owner.</p>
      </div>
    );

  return <>{children}</>;
}
