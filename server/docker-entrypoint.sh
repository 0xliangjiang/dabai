#!/bin/sh
set -e

# 支持分离的 DB_* 配置：自动拼接并 URL 编码密码
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  DATABASE_URL=$(node -e "console.log(\`mysql://\${encodeURIComponent(process.env.DB_USER)}:\${encodeURIComponent(process.env.DB_PASSWORD || '')}@\${process.env.DB_HOST}:\${process.env.DB_PORT || 3306}/\${process.env.DB_NAME}\`)")
  export DATABASE_URL
fi

# Run migrations before starting the API. Recovery is deliberately narrow:
# - P3005 means an old manually-created database needs the init baseline.
# - The known articles migration can be repaired only after its schema is verified.
# Other failures stop startup instead of being incorrectly marked as applied.
MIGRATE_LOG=$(mktemp)
trap 'rm -f "$MIGRATE_LOG"' EXIT

if npx prisma migrate deploy --schema prisma/schema.prisma >"$MIGRATE_LOG" 2>&1; then
  cat "$MIGRATE_LOG"
else
  cat "$MIGRATE_LOG" >&2
  if grep -q "P3005" "$MIGRATE_LOG"; then
    echo "P3005 detected, baselining the init migration..."
    npx prisma migrate resolve \
      --applied 20260610100000_init_mysql \
      --schema prisma/schema.prisma
  elif grep -q "20260724180000_articles" "$MIGRATE_LOG"; then
    echo "Failed articles migration detected, checking its database objects..."
    node scripts/repair-articles-migration.mjs
    npx prisma migrate resolve \
      --applied 20260724180000_articles \
      --schema prisma/schema.prisma
  else
    echo "Database migration failed and has no automatic recovery path." >&2
    exit 1
  fi

  npx prisma migrate deploy --schema prisma/schema.prisma
fi

exec node dist/server.js
