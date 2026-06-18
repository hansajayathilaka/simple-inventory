import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { settingsService } from "../services";
import type {
  AppSettings,
  FeatureFlags,
  ThemeSettings,
} from "../types";

const DEFAULT_FEATURES: FeatureFlags = {
  customers: true,
  returns: true,
  purchasing: true,
  suppliers: true,
  reports: true,
  loyalty: true,
  tags: true,
  discounts: true,
};

const DEFAULT_THEME: ThemeSettings = {
  primary: "#2f6df6",
  sidebar: "#11203a",
  accent: "#1f9d57",
};

interface SettingsState {
  settings: AppSettings | null;
  features: FeatureFlags;
  currency: string;
  companyName: string;
  isLoading: boolean;
  refetch: () => void;
}

const SettingsContext = createContext<SettingsState | null>(null);

function applyTheme(theme: ThemeSettings) {
  const root = document.documentElement;
  root.style.setProperty("--brand", theme.primary || DEFAULT_THEME.primary);
  root.style.setProperty("--sidebar-bg", theme.sidebar || DEFAULT_THEME.sidebar);
  root.style.setProperty("--ok", theme.accent || DEFAULT_THEME.accent);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["app_settings"],
    queryFn: () => settingsService.get(),
    staleTime: 60_000,
  });

  const theme = data?.theme ?? DEFAULT_THEME;
  useEffect(() => {
    applyTheme(theme);
  }, [theme.primary, theme.sidebar, theme.accent]);

  const value = useMemo<SettingsState>(
    () => ({
      settings: data ?? null,
      features: { ...DEFAULT_FEATURES, ...(data?.features ?? {}) },
      currency: data?.currency_symbol ?? "",
      companyName: data?.company_name ?? "Simple Inventory",
      isLoading,
      refetch,
    }),
    [data, isLoading, refetch]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
