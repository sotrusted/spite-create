#!/bin/bash
# Screenshot the running iOS simulator for design feedback.
#   ./shot.sh            -> /tmp/tbd-shot.png
#   ./shot.sh name       -> /tmp/tbd-shot-name.png
# The app hot-reloads via Metro, so the flow is: park the app on the screen
# being iterated on, edit code, run this after each change.
set -e
NAME=${1:-shot}
OUT="/tmp/tbd-shot-${NAME}.png"
xcrun simctl io booted screenshot "$OUT" >/dev/null
echo "$OUT"
