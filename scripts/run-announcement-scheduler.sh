#!/bin/sh

set -u

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET is required for the announcement scheduler" >&2
  exit 1
fi

while true; do
  curl --fail --silent --show-error \
    --connect-timeout 5 \
    --max-time 30 \
    --header "Authorization: Bearer $CRON_SECRET" \
    http://app:3000/api/cron/announcements || true
  sleep 60
done
