#!/bin/sh
set -e

# 支持 DATABASE_URL 或分离的 DB_* 配置，并为 Prisma 设置保守的连接池上限。
# 已在 DATABASE_URL 显式设置的参数优先，不会被默认值覆盖。
NORMALIZED_DATABASE_URL=$(node scripts/normalize-database-url.mjs)
if [ -n "$NORMALIZED_DATABASE_URL" ]; then
  DATABASE_URL=$NORMALIZED_DATABASE_URL
  export DATABASE_URL
fi

# Run migrations before starting the API. Recovery is deliberately narrow:
# - P3005 means an old manually-created database needs the init baseline.
# - The known articles migration can be repaired only after its schema is verified.
# Other failures stop startup instead of being incorrectly marked as applied.
MIGRATE_LOG=$(mktemp)
trap 'rm -f "$MIGRATE_LOG"' EXIT

run_migrate() {
  attempt=1
  max_attempts="${DB_MIGRATION_MAX_ATTEMPTS:-6}"
  delay_seconds=5

  while true; do
    : >"$MIGRATE_LOG"
    if npx prisma migrate deploy --schema prisma/schema.prisma >"$MIGRATE_LOG" 2>&1; then
      return 0
    fi

    if grep -q "Too many connections" "$MIGRATE_LOG" && [ "$attempt" -lt "$max_attempts" ]; then
      cat "$MIGRATE_LOG" >&2
      echo "Database connection limit reached; retrying migration in ${delay_seconds}s (${attempt}/${max_attempts})..." >&2
      sleep "$delay_seconds"
      attempt=$((attempt + 1))
      delay_seconds=$((delay_seconds + 5))
      [ "$delay_seconds" -gt 20 ] && delay_seconds=20
      continue
    fi
    return 1
  done
}

if run_migrate; then
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
    REPAIR_RESULT=$(node scripts/repair-articles-migration.mjs)
    echo "$REPAIR_RESULT"
    case "$REPAIR_RESULT" in
      *"RESOLVE_MODE=rolled-back"*)
        RESOLVE_ACTION="--rolled-back"
        ;;
      *"RESOLVE_MODE=applied"*)
        RESOLVE_ACTION="--applied"
        ;;
      *)
        echo "Articles migration repair did not return a safe resolve mode." >&2
        exit 1
        ;;
    esac
    npx prisma migrate resolve \
      "$RESOLVE_ACTION" 20260724180000_articles \
      --schema prisma/schema.prisma
  else
    echo "Database migration failed and has no automatic recovery path." >&2
    exit 1
  fi

  run_migrate
  cat "$MIGRATE_LOG"
fi

exec node dist/server.js
