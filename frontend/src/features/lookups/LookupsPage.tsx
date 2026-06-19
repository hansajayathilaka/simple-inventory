import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CrudPage from "../../components/CrudPage";
import {
  brandsService,
  categoriesService,
  customLookupsService,
  ingredientsService,
  lookupService,
  uomService,
} from "../../services";
import type { LookupItem } from "../../types";
import { errorMessage } from "../../lib/errors";

// Built-in reference lists rendered with their specific columns/fields.
const BUILTIN_TABS = [
  { key: "categories", label: "Categories" },
  { key: "uom", label: "Units of Measure" },
  { key: "brands", label: "Brands / Makes" },
  { key: "ingredients", label: "Ingredients" },
] as const;

export default function LookupsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("categories");

  // Owner-created custom lists (real lk_* collections).
  const { data: custom } = useQuery({
    queryKey: ["lookup_collections"],
    queryFn: () => customLookupsService.list(),
  });

  const createList = useMutation({
    mutationFn: (label: string) => customLookupsService.create(label),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["lookup_collections"] });
      setTab(res.name);
    },
    onError: (e) => alert(errorMessage(e)),
  });

  const deleteList = useMutation({
    mutationFn: (name: string) => customLookupsService.remove(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookup_collections"] });
      setTab("categories");
    },
    onError: (e) => alert(errorMessage(e)),
  });

  const onNewList = () => {
    const label = prompt(
      "Name of the new reference list (e.g. Color, Material):"
    );
    if (label && label.trim()) createList.mutate(label.trim());
  };

  const activeCustom = (custom ?? []).find((l) => l.name === tab);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Lookups</h1>
          <div className="muted">
            Reference lists used by products and dynamic attributes. Create your
            own lists — no developer needed.
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={onNewList}
          disabled={createList.isPending}
        >
          + New list
        </button>
      </div>

      <div className="inline" style={{ marginBottom: 16 }}>
        {BUILTIN_TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "btn btn-primary" : "btn"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        {(custom ?? []).map((l) => (
          <button
            key={l.name}
            className={tab === l.name ? "btn btn-primary" : "btn"}
            onClick={() => setTab(l.name)}
          >
            {l.label}
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

      {activeCustom && (
        <div>
          <div
            className="inline"
            style={{ justifyContent: "flex-end", marginBottom: 8 }}
          >
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (
                  confirm(
                    `Delete the list "${activeCustom.label}" and all its items? This cannot be undone.`
                  )
                )
                  deleteList.mutate(activeCustom.name);
              }}
              disabled={deleteList.isPending}
            >
              Delete this list
            </button>
          </div>
          <CrudPage<LookupItem>
            key={activeCustom.name}
            title={activeCustom.label}
            service={lookupService(activeCustom.name)}
            queryKey={activeCustom.name}
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
        </div>
      )}
    </div>
  );
}
