-- CreateTable
CREATE TABLE "ai_agents" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "voice" TEXT,
    "language" TEXT,
    "personality" TEXT,
    "openingMessage" TEXT,
    "objective" TEXT,
    "workingHours" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "companyInfo" JSONB NOT NULL DEFAULT '{}',
    "products" JSONB NOT NULL DEFAULT '[]',
    "services" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" UUID NOT NULL,
    "knowledgeBaseId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objections" (
    "id" UUID NOT NULL,
    "knowledgeBaseId" UUID NOT NULL,
    "objection" TEXT NOT NULL,
    "recommendedResponse" TEXT NOT NULL,
    "followUpQuestion" TEXT,
    "escalationRule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_playbooks" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "opening" TEXT,
    "discoveryQuestions" JSONB NOT NULL DEFAULT '[]',
    "qualificationRules" JSONB NOT NULL DEFAULT '{}',
    "objectionHandling" JSONB NOT NULL DEFAULT '{}',
    "closingRules" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_playbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playbook_questions" (
    "id" UUID NOT NULL,
    "playbookId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "purpose" TEXT,
    "expectedInfo" TEXT,
    "possibleAnswers" JSONB NOT NULL DEFAULT '[]',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playbook_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_bases_agentId_key" ON "knowledge_bases"("agentId");

-- CreateIndex
CREATE INDEX "faqs_knowledgeBaseId_idx" ON "faqs"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "objections_knowledgeBaseId_idx" ON "objections"("knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_playbooks_agentId_key" ON "sales_playbooks"("agentId");

-- CreateIndex
CREATE INDEX "playbook_questions_playbookId_idx" ON "playbook_questions"("playbookId");

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_playbooks" ADD CONSTRAINT "sales_playbooks_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_questions" ADD CONSTRAINT "playbook_questions_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "sales_playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
