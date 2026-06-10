#!/usr/bin/env bash
# 大白小助手一键部署脚本：拉代码 → 构建 → 启动 → 健康检查
# 用法：
#   ./deploy/deploy.sh           # 常规部署（增量构建）
#   ./deploy/deploy.sh --fresh   # 强制无缓存重建（镜像疑似不干净时用）
set -euo pipefail

cd "$(dirname "$0")/.."

API_PORT=6543
ADMIN_PORT=3666
FRESH=""
[ "${1:-}" = "--fresh" ] && FRESH="--no-cache"

step() { printf "\n\033[1;32m==> %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31mxx 部署失败：%s\033[0m\n" "$1"; exit 1; }

# ---- 前置检查 ----
[ -f server/.env.production ] || fail "缺少 server/.env.production（复制 server/.env.production.example 并填写）"
command -v docker >/dev/null || fail "未安装 docker"

# 兼容 docker compose（插件版）与 docker-compose（独立版）
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  fail "未找到 docker compose 或 docker-compose"
fi

step "拉取最新代码"
git fetch origin
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "检测到本地改动，自动暂存（git stash）以免阻塞拉取"
  git stash push -m "deploy-auto-stash-$(date +%s)"
fi
git pull --ff-only origin "$BRANCH"
echo "当前版本：$(git log --oneline -1)"

step "构建镜像${FRESH:+（无缓存）}"
$DC build $FRESH

step "移除旧容器"
$DC down --remove-orphans || true
# 兜底强制清理（docker-compose v1 与新版引擎的 ContainerConfig bug 会卡在 recreate）
PROJECT=$(basename "$PWD")
docker ps -aq --filter "name=${PROJECT}" | xargs -r docker rm -f

step "启动服务"
$DC up -d

step "等待 API 就绪（最多 60 秒）"
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  [ "$i" = 30 ] && {
    $DC logs --tail 30 api
    fail "API 健康检查超时，日志见上方"
  }
  sleep 2
done
echo "API   OK  → http://127.0.0.1:${API_PORT}/health"

step "检查管理后台"
if curl -sf -o /dev/null "http://127.0.0.1:${ADMIN_PORT}"; then
  echo "Admin OK  → http://127.0.0.1:${ADMIN_PORT}"
else
  echo "警告：管理后台未响应，查看日志：$DC logs admin"
fi

step "清理悬空镜像"
docker image prune -f >/dev/null

printf "\n\033[1;32m✔ 部署完成\033[0m  %s\n" "$(git log --oneline -1)"
$DC ps
