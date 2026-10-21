#!/bin/sh
set -eu
cd /app
# Keep the sidecar off Zeabur's WEB_PORT (nginx owns 8080).
export PORT=3000
exec node server.mjs
