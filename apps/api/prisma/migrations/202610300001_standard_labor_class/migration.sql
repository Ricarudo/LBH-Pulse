-- User-approved starting labor class and hourly rate. This is editable company
-- configuration, not a calculator constant. Do not overwrite existing configuration.
-- No Item, Quote, or Builder document is changed by this migration.
INSERT INTO "QuoteLaborClass" ("id", "name", "hourlyRate", "enabled", "createdAt", "updatedAt")
VALUES ('standard', 'Standard', 25, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
