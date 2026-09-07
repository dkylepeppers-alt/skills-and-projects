# Nevermore companion world pack (Task 5)

Machine-readable campaign pack for World Map Companion, joined to Nevermore v2 by location/asset ID.

See manifest.json for coverage and gaps. Validate with:

```
python3 projects/world-map-companion/scripts/validate-world-pack.py
cd projects/world-map-companion && node --test tests/world-pack.test.ts
```

Policy: do not edit original.world-map.json or overwrite releases/v2/. Unknown facts stay UNKNOWN/UNCERTAIN/ASSUMPTION. Join by ID only.
