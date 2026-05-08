-- Migration: widen timezone_offset from INTEGER to NUMERIC(4,2)
--
-- Motivation: the Settings UI now exposes half-hour and quarter-hour timezone
-- offsets (e.g. IST UTC+5:30 = 5.5, NPT UTC+5:45 = 5.75, NST UTC−3:30 = −3.5)
-- so that users in India, Nepal, Newfoundland, Iran, etc. can pick the correct
-- zone. An INTEGER column silently truncated these values to the nearest whole
-- hour. NUMERIC(4,2) supports any value in the range −99.99 … +99.99, which
-- comfortably covers all real UTC offsets (−12 to +14 in steps of 0.25).
--
-- The USING clause is a no-op cast (integer → numeric), so existing integer
-- values like 5, −8, 0 are preserved exactly as 5.00, −8.00, 0.00.

ALTER TABLE user_configs
  ALTER COLUMN timezone_offset TYPE NUMERIC(4,2)
  USING timezone_offset::NUMERIC(4,2);

-- Keep the default at 0 (explicit cast ensures type consistency).
ALTER TABLE user_configs
  ALTER COLUMN timezone_offset SET DEFAULT 0;
