-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('draft', 'pending_review', 'published', 'failed');

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "topic" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" JSONB NOT NULL,
    "imagePrompt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageMimeType" TEXT,
    "facebookPhotoId" TEXT,
    "facebookPostId" TEXT,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'draft',
    "error" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPost_userId_status_idx" ON "SocialPost"("userId", "status");

-- CreateIndex
CREATE INDEX "SocialPost_pageId_publishedAt_idx" ON "SocialPost"("pageId", "publishedAt");

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
