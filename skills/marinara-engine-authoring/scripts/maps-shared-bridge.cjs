// The maps model's `@marinara-engine/shared` import resolves here. Use the release's
// built shared entrypoint when present; otherwise load only the real Engine contracts
// the maps model needs from source (the full shared/src/index.ts also imports generated
// feature registries). Run under tsx. No replacement schema is fabricated.
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const engineRoot = process.env.MARINARA_ENGINE_ROOT;
if (!engineRoot) throw new Error("Set MARINARA_ENGINE_ROOT to the Engine checkout.");
const built = resolve(engineRoot, "packages/shared/dist/index.js");
let shared;
if (existsSync(built)) {
  shared = require(built);
} else {
  const schemas = require(resolve(engineRoot, "packages/shared/src/schemas/spatial-context.schema.ts"));
  const spatial = require(resolve(engineRoot, "packages/shared/src/utils/spatial-context.ts"));
  shared = {
    spatialContextDefinitionSchema: schemas.spatialContextDefinitionSchema,
    spatialLocationSchema: schemas.spatialLocationSchema,
    updateSpatialContextRequestSchema: schemas.updateSpatialContextRequestSchema,
    validateSpatialContextDefinition: spatial.validateSpatialContextDefinition,
  };
}

// Zod 4 compatibility shim. World Maps 1.8.0's maps model (Agents ffde8ea4) still
// calls Zod 3 `.innerType()` on the Engine's refined `spatialContextDefinitionSchema`
// while it loads. Engine v2.5.2 uses Zod 4, where `.superRefine()` adds a check to the
// same object instead of wrapping it, so the method is gone. Zod 3 returned the strict
// object without its refinement; the Zod 4 equivalent is the same schema cloned without
// its checks. Added only when missing; parsing of the Engine schema is unchanged.
const definitionSchema = shared.spatialContextDefinitionSchema;
if (definitionSchema && typeof definitionSchema.innerType !== "function" && definitionSchema._zod?.def) {
  Object.defineProperty(definitionSchema, "innerType", {
    configurable: true,
    enumerable: false,
    value: () => definitionSchema.clone({ ...definitionSchema._zod.def, checks: [] }),
  });
}

exports.spatialContextDefinitionSchema = definitionSchema;
exports.spatialLocationSchema = shared.spatialLocationSchema;
exports.updateSpatialContextRequestSchema = shared.updateSpatialContextRequestSchema;
exports.validateSpatialContextDefinition = shared.validateSpatialContextDefinition;
