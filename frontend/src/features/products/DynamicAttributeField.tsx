import { useQuery } from "@tanstack/react-query";
import { lookupService } from "../../services";
import type { AttributeDefinition } from "../../types";

// Renders a single product-attribute input driven by its definition.
// Relation attributes load their options from the referenced lookup collection.
export default function DynamicAttributeField({
  def,
  value,
  onChange,
}: {
  def: AttributeDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const isRelation = def.type === "relation";
  const target = def.target_collection ?? "";

  const { data: options } = useQuery({
    queryKey: ["lookup", target],
    queryFn: () => lookupService(target).all({ sort: "name" }),
    enabled: isRelation && !!target,
  });

  const label = (
    <label>
      {def.label}
      {def.is_required ? " *" : ""}
    </label>
  );

  if (def.type === "boolean") {
    return (
      <div className="field">
        <div className="checkbox">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          <label style={{ margin: 0 }}>{def.label}</label>
        </div>
      </div>
    );
  }

  if (def.type === "number") {
    return (
      <div className="field">
        {label}
        <input
          type="number"
          step="any"
          value={(value as number | string) ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          required={def.is_required}
        />
      </div>
    );
  }

  if (def.type === "date") {
    return (
      <div className="field">
        {label}
        <input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={def.is_required}
        />
      </div>
    );
  }

  if (def.type === "select") {
    const values = def.options?.values ?? [];
    if (def.is_multiple) {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="field">
          {label}
          <select
            multiple
            value={arr}
            onChange={(e) =>
              onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
            }
          >
            {values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div className="field">
        {label}
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={def.is_required}
        >
          <option value="">—</option>
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (isRelation) {
    const opts = options ?? [];
    if (def.is_multiple) {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="field">
          {label}
          <select
            multiple
            value={arr}
            onChange={(e) =>
              onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
            }
          >
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {(o as { name?: string }).name ?? o.id}
              </option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div className="field">
        {label}
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={def.is_required}
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {(o as { name?: string }).name ?? o.id}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // text (default)
  return (
    <div className="field">
      {label}
      <input
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={def.is_required}
      />
    </div>
  );
}
