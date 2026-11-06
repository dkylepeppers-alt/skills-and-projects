// The source-only maps model needs these real Engine contracts, not the entire
// shared index (which also imports generated feature registries). Run under tsx.
const { resolve } = require("node:path");
const engineRoot = process.env.MARINARA_ENGINE_ROOT;
if (!engineRoot) throw new Error("Set MARINARA_ENGINE_ROOT to the Engine checkout.");
const schemas = require(resolve(engineRoot, "packages/shared/src/schemas/spatial-context.schema.ts"));
const spatial = require(resolve(engineRoot, "packages/shared/src/utils/spatial-context.ts"));
const definitionSchema = schemas.spatialContextDefinitionSchema;
// Compatibility shim. World Maps' maps model (Agents ffde8ea4, World Maps 1.8.0)
// still calls Zod 3's `.innerType()` on the refined definition schema. Engine
// v2.5.2 moved to Zod 4, where `.superRefine()` adds a check to the same object
// instead of wrapping it, so `.innerType()` no longer exists. Zod 3 returned the
// strict object without the refinement; the Zod 4 equivalent is the same schema
// cloned without its checks. Parsing behavior of the Engine schema is unchanged.
if (typeof definitionSchema.innerType !== "function" && definitionSchema._zod?.def) {
  Object.defineProperty(definitionSchema, "innerType", {
    configurable: true,
    enumerable: false,
    value: () => definitionSchema.clone({ ...definitionSchema._zod.def, checks: [] }),
  });
}
exports.spatialContextDefinitionSchema = definitionSchema;
exports.spatialLocationSchema = schemas.spatialLocationSchema;
exports.updateSpatialContextRequestSchema = schemas.updateSpatialContextRequestSchema;
exports.validateSpatialContextDefinition = spatial.validateSpatialContextDefinition;
