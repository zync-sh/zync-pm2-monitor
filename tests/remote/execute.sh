#!/bin/sh
set -eu
runtime=$1
shift
case "$runtime" in /home/gajen/.cache/zync-pm2-smoke.*) ;; *) echo 'Invalid isolated test runtime' >&2; exit 2 ;; esac
export PATH="$runtime/bin:$PATH"
export PM2_HOME="$runtime/pm2-home"
exec "$runtime/pm2/node_modules/.bin/pm2" "$@"
