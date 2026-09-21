-- Arena marketplace: public discovery, explicit arena type, slot accounting and creator stack.
DO $$ BEGIN
  CREATE TYPE arena_type_enum AS ENUM ('OPEN','PRIVATE_1V1','TEAM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE hackathon_arenas
  ADD COLUMN IF NOT EXISTS arena_type arena_type_enum NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS max_participants INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS creator_stack VARCHAR(32) NOT NULL DEFAULT 'sql',
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS target_theta_min NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS target_theta_max NUMERIC(5,2);

-- Existing arenas were created as direct participant proposals. Keep them private;
-- newly-created arenas explicitly choose OPEN/PRIVATE_1V1/TEAM.
UPDATE hackathon_arenas
SET arena_type='PRIVATE_1V1', is_public=FALSE
WHERE arena_type='OPEN'
  AND EXISTS (
    SELECT 1 FROM hackathon_participants hp
    WHERE hp.arena_id=hackathon_arenas.id
  );

CREATE INDEX IF NOT EXISTS idx_hackathon_arenas_marketplace
  ON hackathon_arenas(status,is_public,scheduled_start)
  WHERE status IN ('PROPOSED','AGREED','SCHEDULED');

ALTER TABLE hackathon_arenas
  DROP CONSTRAINT IF EXISTS hackathon_arenas_max_participants_check;
ALTER TABLE hackathon_arenas
  ADD CONSTRAINT hackathon_arenas_max_participants_check CHECK (max_participants >= 2);
