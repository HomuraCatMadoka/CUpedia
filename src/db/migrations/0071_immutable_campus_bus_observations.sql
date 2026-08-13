CREATE FUNCTION prevent_campus_bus_arrival_observation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'campus bus arrival observations are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER campus_bus_arrival_observations_immutable
	BEFORE UPDATE OR DELETE ON "campus_bus_arrival_observations"
	FOR EACH ROW
	EXECUTE FUNCTION prevent_campus_bus_arrival_observation_mutation();
