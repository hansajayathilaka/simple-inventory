import CrudPage from "../../components/CrudPage";
import { suppliersService } from "../../services";
import type { Supplier } from "../../types";

export default function SuppliersPage() {
  return (
    <CrudPage<Supplier>
      title="Suppliers"
      subtitle="Vendors you restock products from."
      service={suppliersService}
      queryKey="suppliers"
      sort="name"
      defaultValues={{ is_active: true }}
      columns={[
        { key: "name", label: "Name" },
        { key: "contact_person", label: "Contact" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        {
          key: "is_active",
          label: "Active",
          render: (r) =>
            r.is_active ? <span className="badge ok">Active</span> : <span className="badge">Inactive</span>,
        },
      ]}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "contact_person", label: "Contact person" },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email", type: "email" },
        { name: "address", label: "Address", type: "textarea" },
        { name: "notes", label: "Notes", type: "textarea" },
        { name: "is_active", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
