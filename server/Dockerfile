# 构建阶段：安装全部依赖、生成 Prisma Client、编译 TypeScript
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json server/
COPY admin/package.json admin/
COPY server/prisma server/prisma
RUN npm ci --workspace=server

# 防御：剔除缺少 migration.sql 的残留目录（空目录不进 git，但可能存在于构建机）
RUN find server/prisma/migrations -mindepth 1 -maxdepth 1 -type d \
  -exec sh -c '[ -f "$1/migration.sql" ] || rm -rf "$1"' _ {} \;
RUN npx prisma generate --schema server/prisma/schema.prisma

COPY server/tsconfig.json server/tsconfig.build.json server/
COPY server/src server/src
RUN npm run build --workspace=server

# 运行阶段：仅生产依赖
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY admin/package.json admin/
COPY server/prisma server/prisma
RUN npm ci --workspace=server --omit=dev

RUN find server/prisma/migrations -mindepth 1 -maxdepth 1 -type d \
  -exec sh -c '[ -f "$1/migration.sql" ] || rm -rf "$1"' _ {} \; \
  && npx prisma generate --schema server/prisma/schema.prisma

COPY --from=build /app/server/dist server/dist
COPY server/docker-entrypoint.sh server/docker-entrypoint.sh
RUN chmod +x server/docker-entrypoint.sh && mkdir -p server/data server/uploads

WORKDIR /app/server
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
