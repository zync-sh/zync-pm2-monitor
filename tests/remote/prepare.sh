#!/bin/sh
set -eu
# No system packages, shared PM2 daemon, or existing application is touched.
mkdir -p /home/gajen/.cache
runtime=$(mktemp -d /home/gajen/.cache/zync-pm2-smoke.XXXXXX)
cd "$runtime"
curl --fail --silent --show-error --location https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o SHASUMS256.txt
archive=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64.tar.xz$/ { print $2 }' SHASUMS256.txt)
test -n "$archive"
curl --fail --silent --show-error --location "https://nodejs.org/dist/latest-v22.x/$archive" -o "$archive"
awk -v file="$archive" '$2 == file' SHASUMS256.txt | sha256sum --check --status
tar -xf "$archive" --strip-components=1
PATH="$runtime/bin:$PATH" npm install --prefix "$runtime/pm2" --ignore-scripts --no-audit --no-fund pm2@7.0.4
printf '\nPM2_SMOKE_RUNTIME=%s\n' "$runtime"
