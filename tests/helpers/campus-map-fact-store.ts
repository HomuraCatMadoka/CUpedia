import {
  type CampusMapAppendChangesetCommand,
  withCampusMapFactStoreTransaction,
} from "@/lib/campus-map/fact-store-transaction";

export function appendCampusMapChangesetForStorageTest(
  command: CampusMapAppendChangesetCommand,
): Promise<{ changesetId: string }> {
  return withCampusMapFactStoreTransaction((store) =>
    store.appendChangeset(command),
  );
}
