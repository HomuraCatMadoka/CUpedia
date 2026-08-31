import type {
  CampusMapPublishChange,
  CampusMapPublishCommand,
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";

export type CampusMapMergeFactField = keyof CampusMapPublishFactInput;

export interface CampusMapMergeFieldResolution {
  field: CampusMapMergeFactField;
  valueFrom: "survivor" | "loser" | "custom";
}

interface CampusMapGovernanceCommandBase {
  idempotencyKey: string;
  reason: string;
  client: { name: string; version: string };
}

export type CampusMapFactGovernanceCommand =
  | (CampusMapGovernanceCommandBase & {
      kind: "revert";
      placeId: string;
      baseRevisionId: string;
      targetRevisionId: string;
      sources: CampusMapPublishSourceInput[];
    })
  | (CampusMapGovernanceCommandBase & {
      kind: "merge";
      sourceAccessedOn: string;
      survivor: {
        placeId: string;
        baseRevisionId: string;
        fact: CampusMapPublishFactInput;
        sources: CampusMapPublishSourceInput[];
      };
      loser: {
        placeId: string;
        baseRevisionId: string;
        sources: CampusMapPublishSourceInput[];
      };
      fieldResolutions: CampusMapMergeFieldResolution[];
    })
  | (CampusMapGovernanceCommandBase & {
      kind: "bulk-edit";
      sourceSummary: string;
      changes: Exclude<
        CampusMapPublishChange,
        { operation: "create" | "merge" }
      >[];
      warningAcknowledgements: CampusMapPublishCommand["warningAcknowledgements"];
    });
