import { PrismaClient } from "@prisma/client";

const MIGRATION = "20260724180000_articles";
const prisma = new PrismaClient();

const articlePostSql = `
  CREATE TABLE IF NOT EXISTS \`ArticlePost\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`title\` VARCHAR(191) NOT NULL,
    \`summary\` VARCHAR(512) NULL,
    \`coverUrl\` VARCHAR(1024) NULL,
    \`status\` VARCHAR(191) NOT NULL DEFAULT 'draft',
    \`pinned\` BOOLEAN NOT NULL DEFAULT false,
    \`blocks\` JSON NOT NULL,
    \`viewCount\` INTEGER NOT NULL DEFAULT 0,
    \`publishedAt\` DATETIME(3) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,
    INDEX \`ArticlePost_status_pinned_publishedAt_idx\` (\`status\`, \`pinned\`, \`publishedAt\`),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`;

const articleVisitSql = `
  CREATE TABLE IF NOT EXISTS \`ArticleVisit\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`articleId\` VARCHAR(191) NOT NULL,
    \`visitorKey\` VARCHAR(64) NOT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX \`ArticleVisit_articleId_idx\` (\`articleId\`),
    UNIQUE INDEX \`ArticleVisit_articleId_visitorKey_key\` (\`articleId\`, \`visitorKey\`),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`;

async function main() {
  const migrationRows = await prisma.$queryRawUnsafe(
    `SELECT migration_name, logs, finished_at AS finishedAt
     FROM _prisma_migrations
     WHERE migration_name = ?
       AND rolled_back_at IS NULL
     ORDER BY started_at DESC`,
    MIGRATION
  );

  const failedRows = migrationRows.filter((row) => row.finishedAt === null);
  if (failedRows.length === 0) {
    throw new Error(`No unresolved ${MIGRATION} migration was found`);
  }
  if (failedRows[0].logs) {
    console.error("Original Prisma migration failure:");
    console.error(String(failedRows[0].logs));
  }

  // MySQL DDL is not transactional. A failed migration may have created only
  // ArticlePost, so create missing objects without touching existing data.
  await prisma.$executeRawUnsafe(articlePostSql);
  await prisma.$executeRawUnsafe(articleVisitSql);

  await verifyColumns("ArticlePost", [
    "id",
    "title",
    "summary",
    "coverUrl",
    "status",
    "pinned",
    "blocks",
    "viewCount",
    "publishedAt",
    "createdAt",
    "updatedAt"
  ]);
  await verifyColumns("ArticleVisit", ["id", "articleId", "visitorKey", "createdAt"]);

  await ensureIndex(
    "ArticlePost",
    "ArticlePost_status_pinned_publishedAt_idx",
    ["status", "pinned", "publishedAt"],
    false
  );
  await ensureIndex("ArticleVisit", "ArticleVisit_articleId_idx", ["articleId"], false);
  await ensureIndex(
    "ArticleVisit",
    "ArticleVisit_articleId_visitorKey_key",
    ["articleId", "visitorKey"],
    true
  );
  await ensureArticleForeignKey();

  console.log(`${MIGRATION} database objects are complete and verified.`);
  const hasAppliedRecord = migrationRows.some((row) => row.finishedAt !== null);
  // An applied + failed duplicate needs the failed row rolled back. With only
  // a failed row, the verified objects should be marked as applied.
  console.log(`RESOLVE_MODE=${hasAppliedRecord ? "rolled-back" : "applied"}`);
}

async function verifyColumns(tableName, expectedColumns) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    tableName
  );
  const actual = new Set(rows.map((row) => row.columnName));
  const missing = expectedColumns.filter((column) => !actual.has(column));
  if (missing.length > 0) {
    throw new Error(`${tableName} exists with missing columns: ${missing.join(", ")}`);
  }
}

async function ensureIndex(tableName, indexName, columns, unique) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT INDEX_NAME AS indexName,
            NON_UNIQUE AS nonUnique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnsList
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     GROUP BY INDEX_NAME, NON_UNIQUE`,
    tableName,
    indexName
  );

  if (rows.length > 0) {
    const row = rows[0];
    const actualColumns = String(row.columnsList ?? "").split(",");
    const actualUnique = Number(row.nonUnique) === 0;
    if (actualColumns.join(",") !== columns.join(",") || actualUnique !== unique) {
      throw new Error(`${tableName}.${indexName} exists with an unexpected definition`);
    }
    return;
  }

  const uniqueness = unique ? "UNIQUE " : "";
  const quotedColumns = columns.map((column) => `\`${column}\``).join(", ");
  await prisma.$executeRawUnsafe(
    `CREATE ${uniqueness}INDEX \`${indexName}\` ON \`${tableName}\` (${quotedColumns})`
  );
}

async function ensureArticleForeignKey() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT k.CONSTRAINT_NAME AS constraintName,
            r.DELETE_RULE AS deleteRule,
            r.UPDATE_RULE AS updateRule
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
      AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.TABLE_SCHEMA = DATABASE()
       AND k.TABLE_NAME = 'ArticleVisit'
       AND k.COLUMN_NAME = 'articleId'
       AND k.REFERENCED_TABLE_NAME = 'ArticlePost'
       AND k.REFERENCED_COLUMN_NAME = 'id'`
  );

  if (rows.length > 0) {
    const row = rows[0];
    if (row.deleteRule !== "CASCADE" || row.updateRule !== "CASCADE") {
      throw new Error("ArticleVisit.articleId foreign key exists with unexpected rules");
    }
    return;
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`ArticleVisit\`
    ADD CONSTRAINT \`ArticleVisit_articleId_fkey\`
    FOREIGN KEY (\`articleId\`) REFERENCES \`ArticlePost\`(\`id\`)
    ON DELETE CASCADE ON UPDATE CASCADE
  `);
}

main()
  .catch((error) => {
    console.error("Articles migration repair refused:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
