# 构建阶段：编译管理后台静态文件
FROM node:22-alpine AS build
WORKDIR /app

# API 地址在构建时注入（Vite 静态替换）
ARG VITE_API_BASE_URL=http://localhost:3001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json tsconfig.base.json ./
COPY admin/package.json admin/
COPY server/package.json server/
RUN npm ci --workspace=admin

COPY admin admin
RUN npm run build --workspace=admin

# 运行阶段：nginx 托管静态文件
FROM nginx:1.27-alpine
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/admin/dist /usr/share/nginx/html
EXPOSE 80
