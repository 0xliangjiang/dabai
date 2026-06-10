-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DealPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "steps" JSONB NOT NULL,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DealPost" ("createdAt", "id", "status", "steps", "summary", "title", "updatedAt") SELECT "createdAt", "id", "status", "steps", "summary", "title", "updatedAt" FROM "DealPost";
DROP TABLE "DealPost";
ALTER TABLE "new_DealPost" RENAME TO "DealPost";
CREATE INDEX "DealPost_status_pinned_publishedAt_idx" ON "DealPost"("status", "pinned", "publishedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
