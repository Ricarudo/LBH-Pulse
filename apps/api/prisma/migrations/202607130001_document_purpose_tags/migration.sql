ALTER TABLE "LifecycleDocument"
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "LifecycleDocument_tags_idx" ON "LifecycleDocument" USING GIN ("tags");
