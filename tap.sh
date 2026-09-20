#!/bin/bash
# Tap the booted iOS simulator at point coordinates (393x852 on iPhone 16 Pro).
#   ./tap.sh 196 426        -> tap center
# Companion binary and client venv live in tools/ (see also shot.sh).
set -e
cd "$(dirname "$0")"
UDID=${UDID:-C5DED297-C112-4FA1-B91F-F2D2E6908672}
export PATH="$PWD/tools:$PATH"
./tools/idb-venv/bin/idb ui tap "$1" "$2" --udid "$UDID"
