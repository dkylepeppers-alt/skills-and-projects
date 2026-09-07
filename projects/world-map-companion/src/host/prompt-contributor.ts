/**
 * Read-only prompt contributor registration path (Task 2).
 *
 * When the real Engine `registerCapabilityPromptContext` is injected, this wires
 * through that VERIFIED API. Otherwise it keeps a local PROPOSED adapter registry
 * so tests / offline harnesses can exercise the same contract without claiming
 * package activation on a desktop host.
 */

export type PromptContextRequest = {
  chatId: string;
  chatMeta: Record<string, unknown>;
  mode: string;
  targetCharacterIds?: string[];
  personaId?: string | null;
  placedAgentTypes?: string[];
};

export type PromptContribution =
  | string
  | { text?: string | null; provides?: { inventory?: boolean } }
  | null
  | undefined;

export type PromptContextContributor = (
  request: PromptContextRequest,
) => PromptContribution | Promise<PromptContribution>;

/** Shape of Engine registerCapabilityPromptContext (injectable). */
export type RegisterCapabilityPromptContext = (
  packageId: string,
  contributor: PromptContextContributor,
) => () => void;

export type PromptContributorRegistration = {
  packageId: string;
  /** "wired" when Engine API was used; "proposed-adapter" for local fallback. */
  status: "wired" | "proposed-adapter";
  unregister: () => void;
};

const localContributors = new Map<string, PromptContextContributor>();

/** Test/harness helper: collect from the PROPOSED local adapter only. */
export async function collectLocalProposedPromptContext(
  request: PromptContextRequest,
): Promise<string[]> {
  const blocks: string[] = [];
  for (const [packageId, contribute] of localContributors) {
    try {
      const contribution = await contribute(request);
      if (contribution === null || contribution === undefined) continue;
      const text = typeof contribution === "string" ? contribution : contribution.text;
      if (typeof text === "string" && text.trim().length > 0) {
        blocks.push(text.trim());
      }
    } catch {
      // Mirror Engine: non-fatal skip
      void packageId;
    }
  }
  return blocks;
}

export function clearLocalProposedPromptContributors(): void {
  localContributors.clear();
}

/**
 * Register a read-only contributor. Must not mutate; briefing text comes from a
 * prepared projection (getBriefingText), never from running simulation here.
 */
export function registerReadOnlyPromptContributor(options: {
  packageId: string;
  getBriefingText: (request: PromptContextRequest) => string | null | undefined;
  /** Inject Engine registerCapabilityPromptContext when available. */
  registerCapabilityPromptContext?: RegisterCapabilityPromptContext | null;
}): PromptContributorRegistration {
  const { packageId, getBriefingText } = options;
  if (!packageId || typeof packageId !== "string") {
    throw new Error("registerReadOnlyPromptContributor requires packageId");
  }
  if (typeof getBriefingText !== "function") {
    throw new Error("registerReadOnlyPromptContributor requires getBriefingText");
  }

  const contributor: PromptContextContributor = (request) => {
    // Read-only: no mutation of request / chatMeta.
    const text = getBriefingText(request);
    if (text === null || text === undefined || text.trim().length === 0) return null;
    return text.trim();
  };

  const engineRegister = options.registerCapabilityPromptContext;
  if (typeof engineRegister === "function") {
    const release = engineRegister(packageId, contributor);
    return {
      packageId,
      status: "wired",
      unregister: () => {
        try {
          release();
        } catch {
          // ignore double-release
        }
      },
    };
  }

  localContributors.set(packageId, contributor);
  return {
    packageId,
    status: "proposed-adapter",
    unregister: () => {
      if (localContributors.get(packageId) === contributor) {
        localContributors.delete(packageId);
      }
    },
  };
}
