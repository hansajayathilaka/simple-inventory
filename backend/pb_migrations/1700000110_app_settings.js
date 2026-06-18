/// <reference path="../pb_data/types.d.ts" />

// app_settings: a single-row collection holding shop-wide customization —
// company identity, theme colors, feature flags, receipt/bill layout, label
// (tag sticker) layout, and printer selection. Any authenticated user can read
// it (the UI needs theme + flags); only owners can change it.
//
// A default row is seeded here so the app always has settings to read.
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';
    const OWNER = '@request.auth.role = "owner"';

    const c = new Collection({
      name: "app_settings",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: OWNER,
      updateRule: OWNER,
      deleteRule: null,
      schema: [
        { name: "company_name", type: "text" },
        { name: "company_address", type: "text" },
        { name: "company_phone", type: "text" },
        {
          name: "logo",
          type: "file",
          options: {
            maxSelect: 1,
            maxSize: 2097152,
            mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
          },
        },
        { name: "currency_symbol", type: "text" },
        // { primary, sidebar, accent, ... } CSS color values
        { name: "theme", type: "json", options: { maxSize: 200000 } },
        // { customers, returns, purchasing, suppliers, reports, loyalty, tags }
        { name: "features", type: "json", options: { maxSize: 200000 } },
        // { header, footer, showLogo, paperWidthMm, fontSizePt }
        { name: "receipt", type: "json", options: { maxSize: 200000 } },
        // { widthMm, heightMm, columns, symbology, showName, showPrice, showBarcode }
        { name: "label", type: "json", options: { maxSize: 200000 } },
        // { receiptPrinter, labelPrinter, silent }
        { name: "printers", type: "json", options: { maxSize: 200000 } },
      ],
    });
    dao.saveCollection(c);

    // seed the single settings row with sensible defaults
    const rec = new Record(dao.findCollectionByNameOrId("app_settings"));
    rec.set("company_name", "Simple Inventory");
    rec.set("currency_symbol", "");
    rec.set("theme", {
      primary: "#2f6df6",
      sidebar: "#11203a",
      accent: "#1f9d57",
    });
    rec.set("features", {
      customers: true,
      returns: true,
      purchasing: true,
      suppliers: true,
      reports: true,
      loyalty: true,
      tags: true,
      discounts: true,
    });
    rec.set("receipt", {
      header: "",
      footer: "Thank you!",
      showLogo: true,
      paperWidthMm: 80,
      fontSizePt: 12,
    });
    rec.set("label", {
      widthMm: 50,
      heightMm: 30,
      columns: 3,
      symbology: "CODE128",
      showName: true,
      showPrice: true,
      showBarcode: true,
    });
    rec.set("printers", { receiptPrinter: "", labelPrinter: "", silent: false });
    dao.saveRecord(rec);
  },
  (db) => {
    const dao = new Dao(db);
    dao.deleteCollection(dao.findCollectionByNameOrId("app_settings"));
  }
);
