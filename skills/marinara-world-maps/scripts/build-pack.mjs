#!/usr/bin/env node
// Offline assembler. Contract pins and limitations: references/offline-authoring.md.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  isRecord,
  pick,
  BOOK_KEYS,
  ENTRY_KEYS,
  fingerprint,
} from "./portable-lore.mjs";
const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};
const slug = (v) =>
  String(v)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "map";
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const fail = (message) => {
  throw new Error(message);
};
function preflight(value) {
  const r = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./validate-map.mjs", import.meta.url)),
      "-",
      "--json",
    ],
    {
      input: JSON.stringify(value),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (r.status !== 0)
    fail(`Structural preflight failed: ${r.stdout || r.stderr}`);
  return JSON.parse(r.stdout);
}
function main() {
  const o = { lorebook: [] },
    argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/u, "");
    if (["quiet", "replace-lore"].includes(k)) {
      o[k] = true;
      continue;
    }
    if (
      ![
        "definition",
        "out",
        "images",
        "name",
        "pack",
        "owner",
        "lorebook",
        "links",
        "lore-mode",
      ].includes(k) ||
      !argv[i].startsWith("--") ||
      !argv[i + 1] ||
      argv[i + 1].startsWith("--")
    )
      fail(`Unknown or incomplete option: ${argv[i]}`);
    const v = argv[++i];
    if (k === "lorebook") o.lorebook.push(v);
    else if (o[k] !== undefined) fail(`Repeated --${k}`);
    else o[k] = v;
  }
  if (!o.definition || !o.out)
    fail(
      "Usage: build-pack.mjs --definition map.json --out NEW.world-map.json [--images art] [--lorebook native.json --links links.json]",
    );
  if (
    [o.definition, ...o.lorebook, o.links]
      .filter(Boolean)
      .some((p) => resolve(p) === resolve(o.out))
  )
    fail("Output must not overwrite a source input.");
  const raw = read(o.definition),
    data = isRecord(raw?.data) ? raw.data : raw;
  if (raw?.format !== undefined && raw.format !== "marinara-hierarchical-map")
    fail("Unrecognized envelope format; inspect its importer before converting it.");
  if (raw?.formatVersion !== undefined && (!Number.isInteger(raw.formatVersion) || raw.formatVersion < 1 || raw.formatVersion > 4))
    fail("Unsupported envelope version; refusing to silently rewrite it as version 4.");
  preflight(raw);
  const definition = structuredClone(
    isRecord(data) && "definition" in data ? data.definition : raw,
  );
  if (o.owner) {
    if (!["roleplay", "game"].includes(o.owner))
      fail("Owner must be roleplay or game.");
    definition.ownerMode = o.owner;
  }
  const byId = new Map(definition.locations.map((l) => [l.id.trim(), l]));
  const e = isRecord(data) && "definition" in data ? { ...raw, ...data } : {};
  delete e.data;
  e.format = "marinara-hierarchical-map";
  e.formatVersion = 4;
  e.name =
    o.name ??
    raw.name ??
    definition.locations.find((l) => l.parentId === null)?.name ??
    "World Map";
  e.definition = definition;
  const pack = o.pack ?? slug(e.name) + "-pack",
    artwork = structuredClone(e.artwork ?? []),
    imageIds = new Set(),
    roles = new Set();
  if (!Array.isArray(artwork))
    fail("Existing artwork is not an array; repair it explicitly.");
  for (const a of artwork) {
    if (
      !isRecord(a) ||
      typeof a.sourceImageId !== "string" ||
      imageIds.has(a.sourceImageId.trim())
    )
      fail("Existing artwork has malformed or duplicate source IDs.");
    imageIds.add(a.sourceImageId.trim());
  }
  function collect(dir, role = null) {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (role === null && ["reference", "background"].includes(name))
          collect(full, name);
        continue;
      }
      const ext = extname(name).toLowerCase(),
        mime = MIME[ext];
      if (!mime) continue;
      const id = basename(name, extname(name)),
        loc = byId.get(id);
      if (!loc) fail(`Artwork matches no location ID: ${name}`);
      const which = role ?? "reference",
        roleKey = which + ":" + id;
      if (roles.has(roleKey)) fail(`Duplicate artwork role: ${roleKey}`);
      roles.add(roleKey);
      const sourceImageId = `global-gallery:${pack}:${which}:${id}`;
      if (sourceImageId.length > 200)
        fail(`Artwork ID exceeds 200 characters: ${id}`);
      const bytes = readFileSync(full);
      if (!bytes.length) fail(`Empty image: ${name}`);
      const a = {
        sourceImageId,
        filename: name,
        data: `data:${mime};base64,${bytes.toString("base64")}`,
        prompt: "",
        provider: "user-upload",
        model: "user-upload",
        width: null,
        height: null,
      };
      // Dimensions are optional metadata, not proof of a decodable image.
      if (
        mime === "image/png" &&
        bytes.length >= 24 &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ) {
        a.width = bytes.readUInt32BE(16);
        a.height = bytes.readUInt32BE(20);
      }
      const previous = artwork.findIndex(
        (x) => x.sourceImageId.trim() === sourceImageId,
      );
      if (previous >= 0) artwork[previous] = a;
      else artwork.push(a);
      if (which === "reference") {
        loc.referenceImageId = sourceImageId;
        loc.useReferenceImage = true;
      } else {
        loc.mapBackgroundImageId = sourceImageId;
        loc.mapBackgroundPosition ??= { x: 50, y: 50 };
      }
    }
  }
  if (o.images) {
    collect(o.images);
    e.artwork = artwork;
  }
  if (o.lorebook.length || o.links) {
    if (!o.lorebook.length || !o.links)
      fail("--lorebook and --links must be supplied together.");
    if (e.portableLore != null && !o["replace-lore"])
      fail(
        "Existing lore is preserved. Use --replace-lore only for an intentional, reviewed replacement.",
      );
    const mode = o["lore-mode"] ?? "linked-entries";
    if (!["linked-entries", "complete-lorebooks"].includes(mode))
      fail("Lore mode must be linked-entries or complete-lorebooks.");
    const links = read(o.links);
    if (!isRecord(links))
      fail(
        "links.json must map location IDs to arrays of names or {id} selectors.",
      );
    const books = [],
      all = [],
      ids = new Set(),
      bookIds = new Set();
    for (const path of o.lorebook) {
      const rb = read(path),
        d = isRecord(rb.data) ? rb.data : rb,
        b = d.lorebook;
      if (
        !isRecord(b) ||
        typeof b.id !== "string" ||
        !b.id ||
        typeof b.name !== "string" ||
        !Array.isArray(d.entries) ||
        !Array.isArray(d.folders)
      )
        fail(`Expected native lorebook, entries and folders in ${path}`);
      if (bookIds.has(b.id)) fail(`Duplicate lorebook ID: ${b.id}`);
      bookIds.add(b.id);
      const item = {
        book: b,
        entries: d.entries,
        folders: d.folders,
        index: books.length + 1,
      };
      books.push(item);
      for (const entry of d.entries) {
        if (
          !isRecord(entry) ||
          typeof entry.id !== "string" ||
          !entry.id ||
          typeof entry.name !== "string" ||
          ids.has(entry.id)
        )
          fail("Every source entry needs a distinct nonempty ID and name.");
        ids.add(entry.id);
        all.push({ entry, book: item });
      }
    }
    const selected = new Set(),
      refs = [];
    for (const [id, selectors] of Object.entries(links)) {
      const loc = byId.get(id);
      if (!loc) fail(`Unknown location: ${id}`);
      if (!Array.isArray(selectors)) fail(`Links for ${id} must be an array.`);
      for (const s of selectors) {
        let matches;
        if (typeof s === "string" && s.trim())
          matches = all.filter(
            (x) => x.entry.name.trim().toLowerCase() === s.trim().toLowerCase(),
          );
        else if (isRecord(s) && typeof s.id === "string" && s.id)
          matches = all.filter((x) => x.entry.id === s.id);
        else fail(`Invalid lore selector for ${id}`);
        if (matches.length !== 1)
          fail(
            `Lore selector for ${id} resolved ${matches.length} entries; use an exact ID for ambiguity.`,
          );
        const x = matches[0];
        selected.add(x.entry.id);
        loc.lorebookEntryIds ??= [];
        if (!loc.lorebookEntryIds.includes(x.entry.id))
          loc.lorebookEntryIds.push(x.entry.id);
        if (
          !refs.some(
            (r) => r.locationId === id && r.originalEntryId === x.entry.id,
          )
        )
          refs.push({
            locationId: id,
            locationName: loc.name,
            entryKey: null,
            originalLorebookId: x.book.book.id,
            originalLorebookName: x.book.book.name,
            originalEntryId: x.entry.id,
            originalEntryName: x.entry.name,
          });
      }
    }
    const keyById = new Map();
    let ordinal = 0;
    const portableBooks = books.map(({ book, entries, folders, index }) => {
      const chosen = entries.filter(
          (x) => mode === "complete-lorebooks" || selected.has(x.id),
        ),
        byFolder = new Map();
      for (const f of folders) {
        if (
          !isRecord(f) ||
          typeof f.id !== "string" ||
          !f.id ||
          byFolder.has(f.id)
        )
          fail("Malformed or duplicate folder ID.");
        byFolder.set(f.id, f);
      }
      const used = new Set(
        mode === "complete-lorebooks"
          ? folders.map((f) => f.id)
          : chosen.map((e) => e.folderId).filter(Boolean),
      );
      for (const id of [...used]) {
        let current = id;
        const seen = new Set();
        while (current) {
          if (seen.has(current)) fail("Cyclic folder ancestry.");
          seen.add(current);
          const f = byFolder.get(current);
          if (!f) fail(`Missing folder: ${current}`);
          used.add(current);
          current = f.parentFolderId;
        }
      }
      const folderKeys = new Map(
        [...used].sort().map((id, i) => [id, `book-${index}-folder-${i + 1}`]),
      );
      return {
        key: `book-${index}`,
        originalId: book.id,
        name: book.name,
        settings: pick(book, BOOK_KEYS),
        folders: [...folderKeys].map(([id, key]) => {
          const f = byFolder.get(id);
          if (typeof f.name !== "string") fail("Folder name must be a string.");
          return {
            key,
            originalId: id,
            parentKey: f.parentFolderId
              ? folderKeys.get(f.parentFolderId)
              : null,
            data: {
              name: f.name,
              enabled: f.enabled ?? true,
              order: f.order ?? 0,
            },
          };
        }),
        entries: chosen.map((entry) => {
          const key = `entry-${++ordinal}`;
          keyById.set(entry.id, key);
          const data = { name: entry.name, ...pick(entry, ENTRY_KEYS) };
          return {
            key,
            originalId: entry.id,
            name: entry.name,
            folderKey: entry.folderId ? folderKeys.get(entry.folderId) : null,
            fingerprint: fingerprint(data),
            data,
          };
        }),
      };
    });
    for (const r of refs) r.entryKey = keyById.get(r.originalEntryId);
    e.portableLore = {
      schemaVersion: 1,
      mode,
      books: portableBooks,
      references: refs,
    };
  } else if (o["lore-mode"] || o["replace-lore"])
    fail("Lore options require --lorebook and --links.");
  const check = preflight(e);
  writeFileSync(o.out, JSON.stringify(e, null, 2) + "\n", { flag: "wx" });
  if (!o.quiet) {
    console.log(
      `Wrote ${o.out}: ${definition.locations.length} locations, ${artwork.length} images. Structural preflight passed; not runtime-imported.`,
    );
    for (const w of check.warnings) console.log(`[${w.code}] ${w.message}`);
  }
}
try {
  main();
} catch (e) {
  console.error(e.message);
  process.exitCode = 2;
}
