-- Keep historical event ids null rather than inventing an identity for old rows.
-- New subscriber writes use the RPC-stable event id.
ALTER TABLE "ContractEvent" ADD COLUMN "eventId" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "deadlineConfirmedAt" TIMESTAMP(3);
DROP INDEX "ContractEvent_txHash_type_key";
CREATE UNIQUE INDEX "ContractEvent_txHash_eventId_key" ON "ContractEvent"("txHash", "eventId");
