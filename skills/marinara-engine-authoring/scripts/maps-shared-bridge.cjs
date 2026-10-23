// The source-only maps model needs these real Engine contracts, not the entire
// shared index (which also imports generated feature registries). Run under tsx.
const { resolve } = require("node:path");
const engineRoot = process.env.MARINARA_ENGINE_ROOT;
if (!engineRoot) throw new Error("Set MARINARA_ENGINE_ROOT to the Engine checkout.");
const schemas = require(resolve(engineRoot, "packages/shared/src/schemas/spatial-context.schema.ts"));
const spatial = require(resolve(engineRoot, "packages/shared/src/utils/spatial-context.ts"));
exports.spatialContextDefinitionSchema = schemas.spatialContextDefinitionSchema;
exports.spatialLocationSchema = schemas.spatialLocationSchema;
exports.updateSpatialContextRequestSchema = schemas.updateSpatialContextRequestSchema;
exports.validateSpatialContextDefinition = spatial.validateSpatialContextDefinition;
