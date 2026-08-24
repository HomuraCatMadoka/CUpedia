CREATE TRIGGER "campus_map_provenance_sources_immutable_row"
  BEFORE UPDATE ON "campus_map_provenance_sources"
  FOR EACH ROW EXECUTE FUNCTION "campus_map_reject_ledger_mutation"();
