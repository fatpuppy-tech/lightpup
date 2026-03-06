-- Application build packs / types.
-- Existing installs get a new column; new installs have it in 001_initial.sql.

ALTER TABLE applications
    ADD COLUMN build_type TEXT DEFAULT 'static';

