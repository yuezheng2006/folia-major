#!/bin/sh
set -eu

# 当前文件：校验运行时 provider 并生成只写入临时目录的 Nginx 配置。
case "${FOLIA_AI_PROVIDER:-google}" in
  google|gemini)
    FOLIA_AI_PROVIDER=gemini
    ;;
  openai)
    FOLIA_AI_PROVIDER=openai
    ;;
  *)
    echo "FOLIA_AI_PROVIDER must be google, gemini, or openai" >&2
    exit 1
    ;;
esac

# Compose defaults keep local docker-compose hostnames; Zeabur overrides via env.
export FOLIA_AI_PROVIDER
export FOLIA_NETEASE_UPSTREAM="${FOLIA_NETEASE_UPSTREAM:-netease-api:3000}"
export FOLIA_KUGOU_UPSTREAM="${FOLIA_KUGOU_UPSTREAM:-kugou-api:3000}"
export FOLIA_QQ_UPSTREAM="${FOLIA_QQ_UPSTREAM:-qq-api:3000}"
export FOLIA_API_UPSTREAM="${FOLIA_API_UPSTREAM:-backend:3000}"
export FOLIA_DNS_RESOLVER="${FOLIA_DNS_RESOLVER:-$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)}"

envsubst '${FOLIA_AI_PROVIDER} ${FOLIA_NETEASE_UPSTREAM} ${FOLIA_KUGOU_UPSTREAM} ${FOLIA_QQ_UPSTREAM} ${FOLIA_API_UPSTREAM} ${FOLIA_DNS_RESOLVER}' \
  < /etc/nginx/nginx.conf.template > /tmp/nginx.conf

if [ -x /usr/local/bin/folia-api ]; then
  /usr/local/bin/folia-api &
fi

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
