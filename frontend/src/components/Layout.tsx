import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useSettings } from "../settings/SettingsContext";
import type { FeatureFlags } from "../types";

interface NavItem {
  to: string;
  label: string;
  ownerOnly?: boolean;
  feature?: keyof FeatureFlags;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Grouped, ordered navigation. Items can be gated by owner role and/or a
// feature flag from the customization panel.
const GROUPS: NavGroup[] = [
  {
    title: "Sell",
    items: [
      { to: "/invoices", label: "Invoices" },
      { to: "/returns", label: "Returns", feature: "returns" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { to: "/products", label: "Products", ownerOnly: true },
      { to: "/attributes", label: "Attributes", ownerOnly: true },
      { to: "/lookups", label: "Lookups", ownerOnly: true },
      { to: "/tags", label: "Tag Stickers", ownerOnly: true, feature: "tags" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { to: "/inventory", label: "Stock", ownerOnly: true },
      { to: "/purchasing", label: "Purchasing", ownerOnly: true, feature: "purchasing" },
      { to: "/suppliers", label: "Suppliers", ownerOnly: true, feature: "suppliers" },
    ],
  },
  {
    title: "People",
    items: [
      { to: "/customers", label: "Customers", feature: "customers" },
      { to: "/users", label: "Users", ownerOnly: true },
    ],
  },
  {
    title: "Insights",
    items: [{ to: "/reports", label: "Reports", ownerOnly: true, feature: "reports" }],
  },
  {
    title: "Setup",
    items: [{ to: "/settings", label: "Settings", ownerOnly: true }],
  },
];

export default function Layout() {
  const { user, isOwner, logout } = useAuth();
  const { features, companyName } = useSettings();
  const navigate = useNavigate();

  // Collapsible groups — all expanded by default.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (title: string) =>
    setCollapsed((c) => ({ ...c, [title]: !c[title] }));

  const visible = (item: NavItem) =>
    (!item.ownerOnly || isOwner) && (!item.feature || features[item.feature]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">🛒 {companyName}</div>

        <button
          className="btn btn-primary pos-launch"
          onClick={() => navigate("/pos")}
        >
          ▶ Point of Sale
        </button>

        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            Dashboard
          </NavLink>
          {GROUPS.map((g) => {
            const items = g.items.filter(visible);
            if (items.length === 0) return null;
            const open = !collapsed[g.title];
            return (
              <div key={g.title} className="nav-group">
                <button
                  type="button"
                  className="nav-group-title"
                  onClick={() => toggle(g.title)}
                  aria-expanded={open}
                >
                  <span>{g.title}</span>
                  <span className="nav-chevron">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="nav-group-items">
                    {items.map((n) => (
                      <NavLink
                        key={n.to}
                        to={n.to}
                        className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                      >
                        {n.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{user?.name}</strong>
            <span className="badge">{user?.role}</span>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
