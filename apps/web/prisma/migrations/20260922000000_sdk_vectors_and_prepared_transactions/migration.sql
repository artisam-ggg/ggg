ALTER TABLE "Tournament" ADD COLUMN "distributionBps" INTEGER[];

UPDATE "Tournament"
SET "distributionBps" = ARRAY["firstBps", "secondBps", "thirdBps"];

ALTER TABLE "Tournament" ALTER COLUMN "distributionBps" SET NOT NULL;
ALTER TABLE "Tournament" DROP COLUMN "firstBps", DROP COLUMN "secondBps", DROP COLUMN "thirdBps";

CREATE TABLE "PreparedEscrowTransaction" (
  "hash" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "xdr" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreparedEscrowTransaction_pkey" PRIMARY KEY ("hash")
);

CREATE INDEX "PreparedEscrowTransaction_tournamentId_intent_idx"
  ON "PreparedEscrowTransaction"("tournamentId", "intent");
ALTER TABLE "PreparedEscrowTransaction" ADD CONSTRAINT "PreparedEscrowTransaction_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
