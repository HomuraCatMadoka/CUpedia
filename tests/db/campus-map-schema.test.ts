import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  campusMapBuildings,
  campusMapChangesets,
  campusMapCurrentFacts,
  campusMapCurrentRevisions,
  campusMapFactRevisions,
  campusMapFactSchemas,
  campusMapFloors,
  campusMapPlaceChanges,
  campusMapPlaces,
  campusMapProvenanceSources,
  campusMapRevisionProvenance,
} from "@/db/schema";

describe("Campus Map canonical fact-store schema (#717)", () => {
  it("separates stable identity, immutable history, and active projection", () => {
    expect(getTableColumns(campusMapBuildings).id).toBeDefined();
    expect(getTableColumns(campusMapFloors).buildingId).toBeDefined();
    expect(getTableColumns(campusMapPlaces).id).toBeDefined();

    const changeset = getTableColumns(campusMapChangesets);
    expect(changeset.actorIdSnapshot).toBeDefined();
    expect(changeset.comment).toBeDefined();
    expect(changeset.affectedCount).toBeDefined();
    expect(changeset.publishedAt).toBeDefined();

    const placeChange = getTableColumns(campusMapPlaceChanges);
    expect(placeChange.changesetId).toBeDefined();
    expect(placeChange.placeId).toBeDefined();
    expect(placeChange.operation).toBeDefined();

    const revision = getTableColumns(campusMapFactRevisions);
    expect(revision.previousRevisionId).toBeDefined();
    expect(revision.factSchemaVersion).toBeDefined();
    expect(revision.fieldMetadata).toBeDefined();
    expect(revision.status).toBeDefined();

    const currentRevision = getTableColumns(campusMapCurrentRevisions);
    expect(currentRevision.placeId).toBeDefined();
    expect(currentRevision.revisionId).toBeDefined();
    expect(currentRevision.status).toBeDefined();

    const currentFact = getTableColumns(campusMapCurrentFacts);
    expect(currentFact.placeId).toBeDefined();
    expect(currentFact.revisionId).toBeDefined();
    expect(currentFact.status).toBeDefined();
    expect(currentFact.locationKind).toBeDefined();
  });

  it("keeps historical field meaning and provenance independently addressable", () => {
    const factSchema = getTableColumns(campusMapFactSchemas);
    expect(factSchema.version).toBeDefined();
    expect(factSchema.definition).toBeDefined();
    expect(factSchema.displayMetadata).toBeDefined();

    const provenance = getTableColumns(campusMapProvenanceSources);
    expect(provenance.sourceKind).toBeDefined();
    expect(provenance.sourceRef).toBeDefined();
    expect(provenance.accessedOn).toBeDefined();
    expect(provenance.rightsStatus).toBeDefined();
    expect(provenance.limitations).toBeDefined();

    const revisionSource = getTableColumns(campusMapRevisionProvenance);
    expect(revisionSource.revisionId).toBeDefined();
    expect(revisionSource.provenanceId).toBeDefined();
  });
});
