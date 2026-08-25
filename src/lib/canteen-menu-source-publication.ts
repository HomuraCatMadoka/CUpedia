import type { CanteenMenuSourceProvider } from "@/db/schema";
import {
  menuPublicationIdentityFromEvidence,
  type MenuPublicationIdentity,
} from "./canteen-menu-publication";
import { pinmePublicationCompatibilityKey } from "./canteen-pinme-publication";

function evidenceProvider(evidence: unknown): unknown {
  return evidence !== null &&
    typeof evidence === "object" &&
    !Array.isArray(evidence)
    ? (evidence as Record<string, unknown>).provider
    : null;
}

/** Decodes persisted provider evidence before it reaches generic projection. */
export function menuPublicationIdentityForProvider(
  provider: CanteenMenuSourceProvider,
  evidence: unknown,
): MenuPublicationIdentity | null {
  if (evidenceProvider(evidence) !== provider) return null;
  const explicit = menuPublicationIdentityFromEvidence(evidence);
  if (provider !== "pinme") return explicit;
  const compatibilityKey = pinmePublicationCompatibilityKey(evidence);
  return explicit || compatibilityKey
    ? {
        ...(explicit ?? {}),
        ...(compatibilityKey ? { compatibilityKey } : {}),
      }
    : null;
}
