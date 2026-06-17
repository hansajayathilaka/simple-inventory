import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

interface NavItem {
  to: string;
  label: string;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/pos", label: "Point of Sale" },
  { to: "/invoices", label: "Invoices" },
  { to: "/returns", label: "Returns" },
  { to: "/products", label: "Products", ownerOnly: true },
  { to: "/attributes", label: "Attributes", ownerOnly: true },
  { to: "/lookups", label: "Lookups", ownerOnly: true },
  { to: "/inventory", label: "Inventory", ownerOnly: true },
  { to: "/suppliers", label: "Suppliers", ownerOnly: true },
  { to: "/purchasing", label: "Purchasing", ownerOnly: true },
  { to: "/customers", label: "Customers" },
  { to: "/reports", label: "Reports", ownerOnly: true },
  { to: "/users", label: "Users", ownerOnly: true },
];

export default function Layout() {
  const { user, isOwner, logout } = useAuth();
  const navigate = useNavigate();

  const items = NAV.filter((n) => !n.ownerOnly || isOwner);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">🛒 Simple Inventory</div>
        <nav>
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {n.label}
            </NavLink>
          ))}
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
