#!/bin/sh
# Upload public/models/ to the R2 bucket that cloudflare/worker.ts serves at /models/*.
# Wrangler uploads files up to 315 MB; larger ones (the 355M model) need an S3-compatible tool, see README.
set -e
cd "$(dirname "$0")/../public/models"
find . -type f | sed 's#^\./##' | sort | while read -r f; do
  size=$(wc -c < "$f")
  if [ "$size" -gt 315000000 ]; then echo "skip (too big for wrangler): $f"; continue; fi
  case "$f" in *.json) ct=application/json ;; *) ct=application/octet-stream ;; esac
  npx wrangler r2 object put "redacto-models/$f" --file="$f" --content-type="$ct" --remote > /dev/null
  echo "ok $f"
done
