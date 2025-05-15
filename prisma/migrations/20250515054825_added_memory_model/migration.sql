CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "userPrompt" TEXT,
    "embedding" vector(1536),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRecalledTs" TIMESTAMP(3),
    "valence" DOUBLE PRECISION,
    "arousal" DOUBLE PRECISION,
    "color" TEXT,
    "recallCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);
