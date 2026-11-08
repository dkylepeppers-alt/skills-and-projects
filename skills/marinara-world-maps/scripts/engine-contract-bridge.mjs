// Resolves the maps model's `@marinara-engine/shared` import to the real Engine
// spatial contract. World Maps 1.8.0 still calls Zod 3 `.innerType()` while the
// module loads. Engine v2.5.2 uses Zod 4, where that method is absent. The shim
// is added only when missing and returns the same Engine schema cloned without
// its refinement checks, which is what Zod 3 returned. Parsing the original
// Engine schema is unchanged. Set MARINARA_ENGINE_ROOT before importing this file.
// Node 24 strips these TypeScript sources. No replacement schema is fabricated.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const engineRoot = process.env.MARINARA_ENGINE_ROOT;
if (!engineRoot) throw new Error("Set MARINARA_ENGINE_ROOT to the Engine checkout.");

const built = resolve(engineRoot, "packages/shared/dist/index.js");
const shared = existsSync(built)
  ? await import(pathToFileURL(built).href)
  : await loadSourceContracts(engineRoot);

const definitionSchema = shared.spatialContextDefinitionSchema;
if (definitionSchema && typeof definitionSchema.innerType !== "function" && definitionSchema._zod?.def) {
  Object.defineProperty(definitionSchema, "innerType", {
    configurable: true,
    enumerable: false,
    value() {
      return definitionSchema.clone({ ...definitionSchema._zod.def, checks: [] });
    },
  });
}

export const spatialContextDefinitionSchema = definitionSchema;
export const spatialLocationSchema = shared.spatialLocationSchema;
export const updateSpatialContextRequestSchema = shared.updateSpatialContextRequestSchema;
export const validateSpatialContextDefinition = shared.validateSpatialContextDefinition;
export const SPATIAL_CONTEXT_LIMITS = shared.SPATIAL_CONTEXT_LIMITS;
export const buildSpatialLocationIndex = shared.buildSpatialLocationIndex;
export const resolveSpatialBreadcrumb = shared.resolveSpatialBreadcrumb;
export const resolveSpatialDestinations = shared.resolveSpatialDestinations;
export const resolveSpatialRoute = shared.resolveSpatialRoute;

async function loadSourceContracts(root) {
  const schemas = await import(
    pathToFileURL(resolve(root, "packages/shared/src/schemas/spatial-context.schema.ts")).href
  );
  const spatial = await import(
    pathToFileURL(resolve(root, "packages/shared/src/utils/spatial-context.ts")).href
  );
  return {
    spatialContextDefinitionSchema: schemas.spatialContextDefinitionSchema,
    spatialLocationSchema: schemas.spatialLocationSchema,
    updateSpatialContextRequestSchema: schemas.updateSpatialContextRequestSchema,
    validateSpatialContextDefinition: spatial.validateSpatialContextDefinition,
    SPATIAL_CONTEXT_LIMITS: spatial.SPATIAL_CONTEXT_LIMITS,
    buildSpatialLocationIndex: spatial.buildSpatialLocationIndex,
    resolveSpatialBreadcrumb: spatial.resolveSpatialBreadcrumb,
    resolveSpatialDestinations: spatial.resolveSpatialDestinations,
    resolveSpatialRoute: spatial.resolveSpatialRoute,
  };
}
