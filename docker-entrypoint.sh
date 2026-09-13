#!/bin/sh
set -e

# The node_modules volume starts empty on first run; install Linux binaries there.
if [ ! -x node_modules/.bin/next ]; then
  echo "Installing dependencies in container..."
  npm ci
fi

exec "$@"
