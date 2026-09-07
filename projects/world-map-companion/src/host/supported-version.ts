/**
 * Supported-version detection vs pinned Engine capability API.
 *
 * PROPOSED companion gate — packages must not claim a host API they have not
 * tested. Mirrors Engine getCapabilityApiCompatibilityIssue orientation from
 * the companion side: fail closed on missing/incompatible reports.
 */

import type { CapabilityApiVersion } from "./types.ts";

/** Capability API minor exercised against pinned Engine (supportedCapabilityApi). */
export const COMPANION_TESTED_CAPABILITY_API: Readonly<CapabilityApiVersion> = Object.freeze({
  major: 1,
  minor: 15,
});

/** Minimum API the companion requires (may not exceed tested). */
export const COMPANION_REQUIRED_CAPABILITY_API: Readonly<CapabilityApiVersion> = Object.freeze({
  major: 1,
  minor: 15,
});

export type SupportedVersionResult =
  | {
      ok: true;
      host: CapabilityApiVersion;
      tested: CapabilityApiVersion;
      required: CapabilityApiVersion;
    }
  | {
      ok: false;
      reason: string;
      host: CapabilityApiVersion | null;
      tested: CapabilityApiVersion;
      required: CapabilityApiVersion;
    };

function isVersionShape(value: unknown): value is CapabilityApiVersion {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as CapabilityApiVersion).major === "number" &&
    typeof (value as CapabilityApiVersion).minor === "number" &&
    Number.isFinite((value as CapabilityApiVersion).major) &&
    Number.isFinite((value as CapabilityApiVersion).minor)
  );
}

/**
 * Fail-closed check: refuse missing reports, major mismatch, host too old for
 * required, or companion claiming higher than host supports / higher than tested.
 */
export function detectSupportedVersion(
  hostReports: CapabilityApiVersion | null | undefined,
  options?: {
    required?: CapabilityApiVersion;
    tested?: CapabilityApiVersion;
  },
): SupportedVersionResult {
  const tested = options?.tested ?? COMPANION_TESTED_CAPABILITY_API;
  const required = options?.required ?? COMPANION_REQUIRED_CAPABILITY_API;

  if (required.major !== tested.major || required.minor > tested.minor) {
    return {
      ok: false,
      reason: `Companion required capability API ${required.major}.${required.minor} exceeds tested ${tested.major}.${tested.minor}`,
      host: isVersionShape(hostReports) ? hostReports : null,
      tested,
      required,
    };
  }

  if (!isVersionShape(hostReports)) {
    return {
      ok: false,
      reason: "Host capability API report missing or malformed — fail closed",
      host: null,
      tested,
      required,
    };
  }

  if (hostReports.major !== required.major) {
    return {
      ok: false,
      reason: `Host capability API major ${hostReports.major} incompatible with required ${required.major}`,
      host: hostReports,
      tested,
      required,
    };
  }

  if (hostReports.minor < required.minor) {
    return {
      ok: false,
      reason: `Host capability API ${hostReports.major}.${hostReports.minor} below required ${required.major}.${required.minor}`,
      host: hostReports,
      tested,
      required,
    };
  }

  // Companion must not claim an API newer than the host supports (Engine rule).
  if (required.minor > hostReports.minor) {
    return {
      ok: false,
      reason: `Package requires capability API ${required.major}.${required.minor}; host supports ${hostReports.major}.${hostReports.minor}`,
      host: hostReports,
      tested,
      required,
    };
  }

  return { ok: true, host: hostReports, tested, required };
}

/** Throw on mismatch — used by bridge construction / prepareTurn. */
export function assertSupportedCapabilityApi(
  hostReports: CapabilityApiVersion | null | undefined,
  options?: Parameters<typeof detectSupportedVersion>[1],
): CapabilityApiVersion {
  const result = detectSupportedVersion(hostReports, options);
  if (!result.ok) {
    throw new Error(`supported-version: ${result.reason}`);
  }
  return result.host;
}
