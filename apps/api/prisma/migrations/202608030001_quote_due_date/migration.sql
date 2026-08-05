ALTER TABLE "Quote" ADD COLUMN "dueDate" TIMESTAMP(3);

CREATE INDEX "Quote_dueDate_idx" ON "Quote"("dueDate");
