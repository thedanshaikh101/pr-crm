-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "subscriptionStatus" TEXT,
ADD COLUMN     "throttlePerMinute" INTEGER NOT NULL DEFAULT 300;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "rssUrl" TEXT;

-- AlterTable
ALTER TABLE "Distribution" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "throttlePerMinute" INTEGER;

-- AlterTable
ALTER TABLE "Import" ADD COLUMN     "snapshots" JSONB;

-- AlterTable
ALTER TABLE "NewsroomSettings" ADD COLUMN     "mediaKitHtml" TEXT,
ADD COLUMN     "showRss" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSearch" BOOLEAN NOT NULL DEFAULT true;
