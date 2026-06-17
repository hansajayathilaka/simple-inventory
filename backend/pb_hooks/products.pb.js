/// <reference path="../pb_data/types.d.ts" />

// Validate a product's dynamic `attributes` JSON against the active
// attribute_definitions on create/update. The validator lives in utils.js and
// is required *inside* the handlers because JSVM handlers run in isolated scope.

onRecordBeforeCreateRequest((e) => {
  const { validateProductAttributes } = require(`${__hooks}/utils.js`);
  validateProductAttributes(e.record);
}, "products");

onRecordBeforeUpdateRequest((e) => {
  const { validateProductAttributes } = require(`${__hooks}/utils.js`);
  validateProductAttributes(e.record);
}, "products");
