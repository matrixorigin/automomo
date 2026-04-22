-- Add room-agent execution metadata for automomo artifacts.
ALTER TABLE "Artifact" ADD COLUMN "runId" TEXT;
ALTER TABLE "Artifact" ADD COLUMN "environmentId" TEXT;
ALTER TABLE "Artifact" ADD COLUMN "taskId" TEXT;
ALTER TABLE "Artifact" ADD COLUMN "metadataJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Artifact" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';

CREATE INDEX "Artifact_roomId_type_createdAt_idx" ON "Artifact"("roomId", "type", "createdAt");
CREATE INDEX "Artifact_runId_idx" ON "Artifact"("runId");
CREATE INDEX "Artifact_environmentId_idx" ON "Artifact"("environmentId");
CREATE INDEX "Artifact_taskId_idx" ON "Artifact"("taskId");
