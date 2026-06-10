#!/bin/sh
set -e

# 支持分离的 DB_* 配置：自动拼接并 URL 编码密码
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  DATABASE_URL=$(node -e "console.log(\`mysql://\${encodeURIComponent(process.env.DB_USER)}:\${encodeURIComponent(process.env.DB_PASSWORD || '')}@\${process.env.DB_HOST}:\${process.env.DB_PORT || 3306}/\${process.env.DB_NAME}\`)")
  export DATABASE_URL
fi

# 启动前执行数据库迁移（幂等）。
# P3005：库里已有手动建的表但无迁移历史 → 把初始迁移标记为已应用（基线）后重试
if ! npx prisma migrate deploy --schema prisma/schema.prisma; then
  echo "migrate deploy failed, trying to baseline the init migration..."
  npx prisma migrate resolve --applied 20260610100000_init_mysql --schema prisma/schema.prisma
  npx prisma migrate deploy --schema prisma/schema.prisma
fi

exec node dist/server.js
