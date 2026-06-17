import CrudPage from "../../components/CrudPage";
import { customersService } from "../../services";
import type { Customer } from "../../types";
import { useAuth } from "../../auth/AuthContext";

export default function CustomersPage() {
  const { isOwner } = useAuth();
  return (
    <CrudPage<Customer>
      title="Customers"
      subtitle="Walk-in and regular customers."
      service={customersService}
      queryKey="customers"
      sort="name"
      canDelete={isOwner}
      columns={[
        { key: "name", label: "Name" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        { key: "loyalty_points", label: "Points", className: "num" },
      ]}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email", type: "email" },
        { name: "address", label: "Address", type: "textarea" },
        { name: "notes", label: "Notes", type: "textarea" },
        { name: "loyalty_points", label: "Loyalty points", type: "number" },
      ]}
    />
  );
}
