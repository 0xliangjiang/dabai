# 构建阶段：安装全部依赖、生成 Prisma Client、编译 TypeScript
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json server/
COPY admin/package.json admin/
RUN npm ci --workspace=server

COPY server/prisma server/prisma
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
RUN npm ci --workspace=server --omit=dev

COPY server/prisma server/prisma
RUN npx prisma generate --schema server/prisma/schema.prisma

COPY --from=build /app/server/dist server/dist
COPY server/docker-entrypoint.sh server/docker-entrypoint.sh
RUN chmod +x server/docker-entrypoint.sh && mkdir -p server/data server/uploads

WORKDIR /app/server
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
