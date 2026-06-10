#!/bin/sh
set -e

# 支持分离的 DB_* 配置：自动拼接并 URL 编码密码
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  DATABASE_URL=$(node -e "console.log(\`mysql://\${encodeURIComponent(process.env.DB_USER)}:\${encodeURIComponent(process.env.DB_PASSWORD || '')}@\${process.env.DB_HOST}:\${process.env.DB_PORT || 3306}/\${process.env.DB_NAME}\`)")
  export DATABASE_URL
fi

# 启动前执行数据库迁移（幂等）
npx prisma migrate deploy --schema prisma/schema.prisma

exec node dist/server.js
