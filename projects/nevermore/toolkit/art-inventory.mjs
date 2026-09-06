#!/usr/bin/env node
// Inventory bindings, not image quality or app restoration. Includes every node/status.
import { readFileSync, writeFileSync } from "node:fs";
import { isRecord } from "./portable-lore.mjs";
const args = process.argv.slice(2),
  file = args[0];
try {
  if (!file || file.startsWith("--"))
    throw new Error(
      "Usage: art-inventory.mjs map.json [--json] [--out NEW.json]",
    );
  const raw = JSON.parse(readFileSync(file, "utf8")),
    data = isRecord(raw?.data) ? raw.data : raw,
    d = isRecord(data) && "definition" in data ? data.definition : raw;
  if (!Array.isArray(d?.locations))
    throw new Error("No definition locations array.");
  const bundle = Array.isArray(raw.artwork) ? raw.artwork : [],
    bundled = new Set(),
    duplicates = [];
  for (const a of bundle) {
    if (
      !isRecord(a) ||
      typeof a.sourceImageId !== "string" ||
      !a.sourceImageId.trim() ||
      typeof a.filename !== "string" ||
      !a.filename.trim() ||
      typeof a.data !== "string" ||
      !/^data:image\/(jpeg|png|gif|webp|avif);base64,/iu.test(a.data)
    )
      continue;
    const id = a.sourceImageId.trim();
    if (bundled.has(id)) duplicates.push(id);
    bundled.add(id);
  }
  const referenced = new Set(),
    state = (id) => {
      if (typeof id !== "string" || !id.trim()) return "unassigned";
      referenced.add(id.trim());
      return bundled.has(id.trim()) ? "bundled" : "external";
    };
  const locations = d.locations.map((l) => ({
    locationId: l.id,
    name: l.name,
    kind: l.kind,
    status: l.status ?? "active",
    parentId: l.parentId,
    childPresentation: l.childPresentation ?? "list",
    reference: state(l.referenceImageId),
    referenceEnabled: l.useReferenceImage === true,
    background: state(l.mapBackgroundImageId),
    backgroundExpected: (l.childPresentation ?? "list") === "map",
  }));
  const byKind = {};
  for (const l of locations) {
    const row = (byKind[l.kind] ??= {
      locations: 0,
      referencesAssigned: 0,
      referencesBundled: 0,
      backgroundsExpected: 0,
      backgroundsAssigned: 0,
    });
    row.locations++;
    row.referencesAssigned += l.reference !== "unassigned";
    row.referencesBundled += l.reference === "bundled";
    row.backgroundsExpected += l.backgroundExpected;
    row.backgroundsAssigned += l.background !== "unassigned";
  }
  const result = {
    evidence:
      "Assignment and supported-data-URL-prefix inventory only; not decoded, visually reviewed or runtime-imported.",
    totalLocations: locations.length,
    byKind,
    bundledIds: bundled.size,
    duplicateBundleIds: duplicates,
    unusedBundleIds: [...bundled].filter((id) => !referenced.has(id)),
    missingReferences: locations
      .filter((l) => l.reference === "unassigned")
      .map((l) => l.locationId),
    missingMapBackgrounds: locations
      .filter((l) => l.backgroundExpected && l.background === "unassigned")
      .map((l) => l.locationId),
    externalBindings: locations
      .filter((l) => l.reference === "external" || l.background === "external")
      .map((l) => l.locationId),
    locations,
  };
  const output = JSON.stringify(result, null, 2) + "\n";
  if (args.includes("--out")) {
    const path = args[args.indexOf("--out") + 1];
    if (!path || path.startsWith("--"))
      throw new Error("--out needs a new filename.");
    writeFileSync(path, output, { flag: "wx" });
  }
  if (args.includes("--json")) console.log(output);
  else {
    console.log(result.evidence);
    console.log(
      `\n${locations.length} nodes, ${bundled.size} distinct bundled IDs. Floors and rooms included.`,
    );
    console.log(
      "\n| Kind | Nodes | References assigned | References bundled | Backgrounds expected | Backgrounds assigned |\n| --- | ---: | ---: | ---: | ---: | ---: |",
    );
    for (const [kind, k] of Object.entries(byKind))
      console.log(
        `| ${kind} | ${k.locations} | ${k.referencesAssigned} | ${k.referencesBundled} | ${k.backgroundsExpected} | ${k.backgroundsAssigned} |`,
      );
    for (const key of [
      "missingReferences",
      "missingMapBackgrounds",
      "externalBindings",
      "duplicateBundleIds",
      "unusedBundleIds",
    ])
      console.log(
        `\n${key}: ${result[key].length ? result[key].join(", ") : "none"}`,
      );
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 2;
}
