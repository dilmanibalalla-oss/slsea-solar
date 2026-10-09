const mongoose = require("mongoose");
const config = require("../config");
const { Province, District, Substation, Installation, Reading } = require("../models");
const { metadataSchemas, query, validateId, noQuery } = require("../validators");
const { sendRepresentation, requireMatch, paginate, sendPage } = require("../utils/http");
const { authorizedScope, accessibleResource } = require("../services/scope");
const { fail } = require("../middleware/errors");
const resources = {
  provinces: { model: Province, parent: null, child: { model: District, field: "province" } },
  districts: { model: District, parent: { model: Province, field: "province" }, child: { model: Substation, field: "district" } },
  substations: { model: Substation, parent: { model: District, field: "district" }, child: { model: Installation, field: "substation" } },
  installations: { model: Installation, parent: { model: Substation, field: "substation" }, child: { model: Reading, field: "installation" } }
};
async function listMetadata(req, res, collection, forced = {}) {
  const options = query(req);
  const scope = await authorizedScope(req.auth, { ...options, ...forced });
  const result = await paginate(req, resources[collection].model,
    { _id: { $in: scope[collection].map((row) => row._id) } },
    { name: 1, _id: 1 }, options);
  sendPage(req, res, result);
}
async function assertParent(definition, body, session) {
  if (!definition.parent) return;
  const { model, field } = definition.parent;
  const parent = await model.findById(body[field]).session(session);
  if (!parent) fail(400, "INVALID_PARENT", `${field} does not exist`);
  // Coordinate child creation with deletion of its parent.
  await model.updateOne({ _id: parent._id }, { $inc: { __v: 1 } }, { session });
}
async function assertNoChildren(definition, id, session) {
  const child = await definition.child.model.exists({
    [definition.child.field]: id
  }).session(session);
  if (child) fail(409, "RESOURCE_HAS_CHILDREN", "Remove dependent resources before deleting this resource");
}
function list(collection) {
  return async (req, res) => {
    await listMetadata(req, res, collection);
  };
}
function getOne(collection) {
  return async (req, res) => {
    noQuery(req);
    const id = validateId(req.params.id);
    const resource = await accessibleResource(req.auth, collection, id);
    sendRepresentation(req, res, resource);
  };
}
function create(collection) {
  return async (req, res) => {
    const definition = resources[collection];
    noQuery(req);
    const body = metadataSchemas[collection].parse(req.body);
    let created;
    await mongoose.connection.transaction(async (session) => {
      await assertParent(definition, body, session);
      [created] = await definition.model.create([body], { session });
    });
    res.set("Location", `${config.base}/${collection}/${created._id}`);
    sendRepresentation(req, res, created.toObject(), 201);
  };
}
function update(collection, method) {
  return async (req, res) => {
    const definition = resources[collection];
    noQuery(req);
    const id = validateId(req.params.id);
    const schema = method === "put" ? metadataSchemas[collection] : metadataSchemas[collection].partial();
    const body = schema.parse(req.body);
    if (method === "patch" && Object.keys(body).length === 0) fail(400, "EMPTY_PATCH", "Supply at least one field");
    let updated;
    await mongoose.connection.transaction(async (session) => {
      const current = await definition.model.findById(id).session(session).lean();
      if (!current) fail(404, "NOT_FOUND", "Resource not found");
      requireMatch(req, current);
      if (definition.parent && body[definition.parent.field] !== undefined &&
          String(current[definition.parent.field]) !== body[definition.parent.field]) {
        fail(409, "PARENT_IMMUTABLE", "Changing a resource's jurisdiction requires a separate migration");
      }
      if (collection === "installations" && body.meterId !== undefined && current.meterId !== body.meterId) {
        fail(409, "METER_ID_IMMUTABLE", "Meter identity cannot be changed through metadata updates");
      }
      updated = await definition.model.findOneAndUpdate(
        { _id: id, __v: current.__v }, { $set: body, $inc: { __v: 1 } },
        { new: true, runValidators: true, session }
      ).lean();
      if (!updated) fail(412, "PRECONDITION_FAILED", "Resource changed concurrently");
    });
    sendRepresentation(req, res, updated);
  };
}
function remove(collection) {
  return async (req, res) => {
    const definition = resources[collection];
    noQuery(req);
    const id = validateId(req.params.id);
    await mongoose.connection.transaction(async (session) => {
      const current = await definition.model.findById(id).session(session).lean();
      if (!current) fail(404, "NOT_FOUND", "Resource not found");
      requireMatch(req, current);
      await assertNoChildren(definition, id, session);
      const result = await definition.model.deleteOne({ _id: id, __v: current.__v }, { session });
      if (!result.deletedCount) fail(412, "PRECONDITION_FAILED", "Resource changed concurrently");
    });
    res.status(204).end();
  };
}
function listNested(parentCollection, childCollection, filterField) {
  return async (req, res) => {
    const id = validateId(req.params.id);
    await accessibleResource(req.auth, parentCollection, id);
    await listMetadata(req, res, childCollection, { [filterField]: id });
  };
}
function handlers(collection) {
  return {
    list: list(collection),
    getOne: getOne(collection),
    create: create(collection),
    replace: update(collection, "put"),
    patch: update(collection, "patch"),
    remove: remove(collection)
  };
}
module.exports = { resources, listMetadata, list, getOne, create, update, remove, listNested, handlers };
