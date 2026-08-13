FROM node:24-alpine AS builder

LABEL "language"="nodejs"
LABEL "framework"="vite"

WORKDIR /app

ARG VCS_REF=local
ARG STACK_VERSION=zeabur
ARG REQUIRE_COMMIT_NAME=false
COPY package.json package-lock.json ./
RUN npm install

COPY . .
ENV VITE_NETEASE_API_BASE=/netease
ENV VITE_KUGOU_API_BASE=/kugou
ENV VITE_QQ_API_BASE=/qq
ENV VITE_AI_PROVIDER=google
ENV VERCEL_GIT_COMMIT_SHA=${VCS_REF}
ENV VERCEL_GIT_COMMIT_REF=zeabur
ENV APP_VERSION_LABEL=Zeabur
ENV APP_RELEASE_CHANNEL=zeabur
ENV DOCKER_STACK_VERSION=${STACK_VERSION}
ENV REQUIRE_COMMIT_NAME=${REQUIRE_COMMIT_NAME}
RUN npm exec vite build
RUN npm run build:vercel-api

FROM node:24-alpine AS api-deps

WORKDIR /app
COPY deploy/docker/backend/package.json deploy/docker/backend/package-lock.json ./
RUN npm install --omit=dev

FROM nginx:1.29-alpine AS runner

LABEL "language"="nodejs"
LABEL "framework"="vite"

RUN apk add --no-cache gettext nodejs

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/api /app/api
COPY --from=builder /app/shared /app/shared
COPY --from=api-deps /app/node_modules /app/node_modules
COPY deploy/docker/backend/package.json /app/package.json
COPY deploy/docker/backend/server.mjs /app/server.mjs
COPY deploy/docker/gateway/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deploy/docker/gateway/entrypoint.sh /usr/local/bin/folia-gateway
COPY deploy/zeabur/folia-api.sh /usr/local/bin/folia-api
RUN chmod 0555 /usr/local/bin/folia-gateway /usr/local/bin/folia-api \
  && mkdir -p /var/cache/nginx /tmp \
  && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /tmp /app

ENV FOLIA_AI_PROVIDER=google
ENV FOLIA_NETEASE_UPSTREAM=folia-netease-api.zeabur.internal:8080
ENV FOLIA_KUGOU_UPSTREAM=folia-kugou-api.zeabur.internal:8080
ENV FOLIA_QQ_UPSTREAM=folia-qq-api.zeabur.internal:8080
ENV FOLIA_API_UPSTREAM=127.0.0.1:3000
ENV PORT=3000
ENV NODE_ENV=production

USER nginx
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/folia-gateway"]
