import type {
  CampusMapProviderIdentity,
  CampusMapProviderMappingTarget,
} from "./provider-mapping-registry";

export type CampusMapProviderMappingCandidateSignal =
  | {
      kind: "name";
      providerName: string;
      canonicalName: string;
    }
  | { kind: "distance"; meters: number }
  | {
      kind: "coordinate";
      providerCrs: string;
      canonicalCrs: "wgs84";
    };

export interface CampusMapProviderMappingCandidate {
  status: "candidate";
  identity: CampusMapProviderIdentity;
  target: CampusMapProviderMappingTarget;
  signals: CampusMapProviderMappingCandidateSignal[];
}

/** Evidence for an admin decision; this pure module cannot create a mapping. */
export function createCampusMapProviderMappingCandidate(input: {
  identity: CampusMapProviderIdentity;
  target: CampusMapProviderMappingTarget;
  signals: readonly CampusMapProviderMappingCandidateSignal[];
}): CampusMapProviderMappingCandidate {
  return {
    status: "candidate",
    identity: { ...input.identity },
    target: { ...input.target },
    signals: input.signals.map((signal) => ({ ...signal })),
  };
}
