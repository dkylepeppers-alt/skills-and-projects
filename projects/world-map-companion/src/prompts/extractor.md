# World Map Companion — Extraction Schema Instructions

**Status:** Companion prompt module (Task 9 scaffold for Task 10). Not part of the frozen FF5.4 preset.
**Invocation:** At most one additional extraction call per accepted response; skip when no relevant narrative change exists.

## Role

Propose campaign-state changes established by **accepted narration**. Merge compatible tracker evidence. Do not invent player actions. Do not consume the same legacy report payload twice.

## Exclude from evidence

- Hidden reasoning / CoT traces
- Control markup and display-only regex transforms
- Quoted plans that were not enacted
- Duplicated legacy internal-report payloads already applied
- OOC / edit / retry chatter that did not establish in-world facts

## Output schema (respond ONLY with valid JSON)

```json
{
  "schemaVersion": 1,
  "proposals": [
    {
      "kind": "placement|discovery|door|object|journal|appointment|none",
      "subjectId": "stable-id",
      "summary": "one factual line",
      "certainty": "sourced|assumption|unknown",
      "evidence": [{ "messageId": "…", "span": "short quote" }]
    }
  ],
  "rejected": [{ "reason": "ambiguous|contradicts-owner|ooc|duplicate", "summary": "…" }],
  "notes": "optional"
}
```

## Honesty

- CompanionHostBridge remains **PROPOSED**.
- This prompt does not write Engine CapabilityDocumentStore documents by itself.
- Native spatial / inventory / quest owners remain authoritative in their domains.
