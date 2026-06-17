import { useState } from "react";
import CrudPage from "../../components/CrudPage";
import {
  brandsService,
  categoriesService,
  ingredientsService,
  uomService,
} from "../../services";

const TABS = [
  { key: "categories", label: "Categories" },
  { key: "uom", label: "Units of Measure" },
  { key: "brands", label: "Brands / Makes" },
  { key: "ingredients", label: "Ingredients" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function LookupsPage() {
  const [tab, setTab] = useState<TabKey>("categories");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Lookups</h1>
          <div className="muted">
            Reference lists used by products and dynamic attributes.
          </div>
        </div>
      </div>

      <div className="inline" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "btn btn-primary" : "btn"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "categories" && (
        <CrudPage
          title="Categories"
          service={categoriesService}
          queryKey="categories"
          sort="name"
          columns={[
            { key: "name", label: "Name" },
            { key: "description", label: "Description" },
          ]}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "description", label: "Description", type: "textarea" },
          ]}
        />
      )}
      {tab === "uom" && (
        <CrudPage
          title="Units of Measure"
          service={uomService}
          queryKey="uom"
          sort="name"
          columns={[
            { key: "name", label: "Name" },
            { key: "abbreviation", label: "Abbreviation" },
          ]}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "abbreviation", label: "Abbreviation", required: true },
          ]}
        />
      )}
      {tab === "brands" && (
        <CrudPage
          title="Brands"
          service={brandsService}
          queryKey="brands"
          sort="name"
          columns={[
            { key: "name", label: "Name" },
            { key: "description", label: "Description" },
          ]}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "description", label: "Description", type: "textarea" },
          ]}
        />
      )}
      {tab === "ingredients" && (
        <CrudPage
          title="Ingredients"
          service={ingredientsService}
          queryKey="ingredients"
          sort="name"
          columns={[
            { key: "name", label: "Name" },
            { key: "description", label: "Description" },
          ]}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "description", label: "Description", type: "textarea" },
          ]}
        />
      )}
    </div>
  );
}
