import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { pb } from "../lib/pocketbase";
import type { Role, User } from "../types";

interface AuthState {
  user: User | null;
  isOwner: boolean;
  isAuthenticated: boolean;
  login: (identity: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(
    (pb.authStore.model as User | null) ?? null
  );

  useEffect(() => {
    // Keep React state in sync with the PB auth store (login/logout/refresh).
    const unsub = pb.authStore.onChange(() => {
      setUser((pb.authStore.model as User | null) ?? null);
    });
    // Best-effort refresh on mount to validate a persisted session.
    if (pb.authStore.isValid) {
      pb.collection("users")
        .authRefresh()
        .catch(() => pb.authStore.clear());
    }
    return () => unsub();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isOwner: user?.role === "owner",
      isAuthenticated: !!user,
      login: async (identity, password) => {
        await pb.collection("users").authWithPassword(identity, password);
      },
      logout: () => pb.authStore.clear(),
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function hasRole(user: User | null, role: Role): boolean {
  return user?.role === role;
}
