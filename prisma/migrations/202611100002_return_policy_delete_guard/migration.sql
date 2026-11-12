-- Preserve ordinary PAYMENT-policy DELETE behavior; RETURNS policies remain immutable.
-- No existing rows or timestamps are changed.
CREATE OR REPLACE FUNCTION returnwise_protect_return_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."usage"='RETURNS' THEN RAISE EXCEPTION 'Return policies are immutable; create a version'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
