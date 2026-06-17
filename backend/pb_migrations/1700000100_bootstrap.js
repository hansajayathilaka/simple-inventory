/// <reference path="../pb_data/types.d.ts" />

// First-run bootstrap so a freshly installed (e.g. packaged desktop) app is
// immediately usable: create a default superuser and an owner login if none
// exist yet. SECURITY: change these credentials after first login.
//
// This is idempotent — it only acts when the respective accounts are absent,
// so it is a no-op on existing installations and in dev where an admin was
// already created via the CLI.
migrate(
  (db) => {
    const dao = new Dao(db);

    // default superuser (PocketBase admin)
    try {
      if (dao.totalAdmins() === 0) {
        const admin = new Admin();
        admin.email = "admin@shop.local";
        admin.setPassword("admin12345");
        dao.saveAdmin(admin);
      }
    } catch (e) {
      console.log("bootstrap admin skipped:", String(e));
    }

    // default owner user
    try {
      let ownerExists = false;
      try {
        dao.findFirstRecordByFilter("users", "role = 'owner'");
        ownerExists = true;
      } catch (_) {
        ownerExists = false;
      }
      if (!ownerExists) {
        const users = dao.findCollectionByNameOrId("users");
        const owner = new Record(users);
        owner.set("username", "owner");
        owner.set("email", "owner@shop.local");
        owner.set("name", "Shop Owner");
        owner.set("role", "owner");
        owner.set("active", true);
        owner.set("emailVisibility", true);
        owner.setPassword("owner12345");
        dao.saveRecord(owner);
      }
    } catch (e) {
      console.log("bootstrap owner skipped:", String(e));
    }
  },
  (_db) => {
    // no-op down: we don't delete accounts on rollback
  }
);
