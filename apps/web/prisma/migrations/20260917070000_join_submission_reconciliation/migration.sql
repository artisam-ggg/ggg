CREATE TABLE "JoinSubmission" (
    "txHash" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerAddr" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JoinSubmission_pkey" PRIMARY KEY ("txHash")
);

CREATE INDEX "JoinSubmission_tournamentId_playerAddr_idx"
ON "JoinSubmission"("tournamentId", "playerAddr");

ALTER TABLE "JoinSubmission"
ADD CONSTRAINT "JoinSubmission_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
