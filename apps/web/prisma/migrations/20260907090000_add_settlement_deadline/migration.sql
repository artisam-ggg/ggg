-- Nullable only for tournaments created before deadline support. The create
-- API requires this value for all new tournaments.
ALTER TABLE "Tournament"
ADD COLUMN "settlementDeadline" TIMESTAMP(3);
