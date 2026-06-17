import { createHashRouter, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./features/auth/LoginPage";
import Dashboard from "./features/dashboard/Dashboard";
import PosPage from "./features/pos/PosPage";
import InvoicesPage from "./features/sales/InvoicesPage";
import InvoiceDetailPage from "./features/sales/InvoiceDetailPage";
import ReturnsPage from "./features/returns/ReturnsPage";
import ProductsPage from "./features/products/ProductsPage";
import AttributesPage from "./features/attributes/AttributesPage";
import LookupsPage from "./features/lookups/LookupsPage";
import InventoryPage from "./features/inventory/InventoryPage";
import SuppliersPage from "./features/suppliers/SuppliersPage";
import PurchasingPage from "./features/purchasing/PurchasingPage";
import CustomersPage from "./features/customers/CustomersPage";
import ReportsPage from "./features/reports/ReportsPage";
import UsersPage from "./features/users/UsersPage";

// HashRouter is used so the built app works under file:// inside Electron.
const owner = (el: JSX.Element) => <ProtectedRoute ownerOnly>{el}</ProtectedRoute>;
const staff = (el: JSX.Element) => <ProtectedRoute>{el}</ProtectedRoute>;

export const router = createHashRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: "pos", element: staff(<PosPage />) },
      { path: "invoices", element: staff(<InvoicesPage />) },
      { path: "invoices/:id", element: staff(<InvoiceDetailPage />) },
      { path: "returns", element: staff(<ReturnsPage />) },
      { path: "customers", element: staff(<CustomersPage />) },
      { path: "products", element: owner(<ProductsPage />) },
      { path: "attributes", element: owner(<AttributesPage />) },
      { path: "lookups", element: owner(<LookupsPage />) },
      { path: "inventory", element: owner(<InventoryPage />) },
      { path: "suppliers", element: owner(<SuppliersPage />) },
      { path: "purchasing", element: owner(<PurchasingPage />) },
      { path: "reports", element: owner(<ReportsPage />) },
      { path: "users", element: owner(<UsersPage />) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
