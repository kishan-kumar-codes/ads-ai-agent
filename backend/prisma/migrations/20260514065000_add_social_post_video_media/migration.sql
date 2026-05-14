ALTER TABLE "SocialPost" ADD COLUMN "mediaType" TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN "mediaPrompt" TEXT,
  ADD COLUMN "mediaUrl" TEXT,
  ADD COLUMN "mediaPath" TEXT,
  ADD COLUMN "mediaMimeType" TEXT,
  ADD COLUMN "facebookVideoId" TEXT;

UPDATE "SocialPost"
SET "mediaPrompt" = "imagePrompt",
    "mediaUrl" = "imageUrl",
    "mediaMimeType" = "imageMimeType";
