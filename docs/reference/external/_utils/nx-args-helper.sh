#!/bin/bash

# This script helps extract arguments from NX command line
# Usage: nx-args-helper.sh <script-to-run> <args-string>

SCRIPT="$1"
shift

# Print all arguments for debugging
echo "All arguments received: $@"

# For add-script, we need to pass both name and URL
if [[ "$SCRIPT" == *"add-script.sh"* ]]; then
  NAME="$1"
  URL="$2"
  echo "Using source directory: $NAME"
  echo "Using source URL: $URL"
  "$SCRIPT" "$NAME" "$URL"
else
  # For other scripts (like pull-script), use the original logic
  SOURCE="$1"
  echo "Using source directory: $SOURCE"
  "$SCRIPT" "$SOURCE"
fi
