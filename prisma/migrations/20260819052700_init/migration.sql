-- CreateTable
CREATE TABLE "Person" (
    "id" SERIAL NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "experienceYears" DOUBLE PRECISION,
    "currentCtc" DOUBLE PRECISION,
    "ctcMalformed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "matchedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonSkill" (
    "personId" INTEGER NOT NULL,
    "skillId" INTEGER NOT NULL,

    CONSTRAINT "PersonSkill_pkey" PRIMARY KEY ("personId","skillId")
);

-- CreateTable
CREATE TABLE "AudioSubmission" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER,
    "submitterName" TEXT NOT NULL,
    "submitterPhone" TEXT,
    "filePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "sampleRateHz" INTEGER,
    "bitrateKbps" DOUBLE PRECISION,
    "loudnessDb" DOUBLE PRECISION,
    "noiseScore" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillClassification" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'n8n',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillClassification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceRecord_source_sourceRow_key" ON "SourceRecord"("source", "sourceRow");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SkillClassification_personId_source_key" ON "SkillClassification"("personId", "source");

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonSkill" ADD CONSTRAINT "PersonSkill_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonSkill" ADD CONSTRAINT "PersonSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioSubmission" ADD CONSTRAINT "AudioSubmission_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillClassification" ADD CONSTRAINT "SkillClassification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
