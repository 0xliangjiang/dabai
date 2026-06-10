#!/bin/sh
set -e

# 启动前执行数据库迁移（幂等）
npx prisma migrate deploy --schema prisma/schema.prisma

exec node dist/server.js
