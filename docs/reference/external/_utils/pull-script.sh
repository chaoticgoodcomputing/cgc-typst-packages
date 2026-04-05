#!/bin/bash

# This script pulls a repository for a given external source directory
# Usage: pull-script.sh <directory-name>

SOURCE_DIR="$1"

# Skip directories that start with an underscore
if [[ "$SOURCE_DIR" == _* ]]; then
  echo "Skipping directory that starts with underscore: $SOURCE_DIR"
  exit 0
fi

if [ -f "$SOURCE_DIR/.source.env" ]; then
  source "$SOURCE_DIR/.source.env"
  if [ "$SOURCE_TYPE" = "repo" ]; then
    echo "Pulling repository: $SOURCE_ADDRESS for $SOURCE_DIR"
    rm -rf "$SOURCE_DIR/repo"
    mkdir -p "$SOURCE_DIR/repo"

    # Handle Bash arrays for SPARSE_TARGETS and EXCLUDE_PATTERNS
    declare -a SPARSE_TARGETS_ARR
    declare -a EXCLUDE_PATTERNS_ARR
    if declare -p SPARSE_TARGETS 2>/dev/null | grep -q 'declare \-a'; then
      SPARSE_TARGETS_ARR=("${SPARSE_TARGETS[@]}")
    elif [ -n "$SPARSE_TARGETS" ]; then
      SPARSE_TARGETS_ARR=($SPARSE_TARGETS)
    fi

    if declare -p EXCLUDE_PATTERNS 2>/dev/null | grep -q 'declare \-a'; then
      EXCLUDE_PATTERNS_ARR=("${EXCLUDE_PATTERNS[@]}")
    elif [ -n "$EXCLUDE_PATTERNS" ]; then
      EXCLUDE_PATTERNS_ARR=($EXCLUDE_PATTERNS)
    fi
    
    # Check if sparse checkout is requested (non-empty after parsing)
    if [ "${#SPARSE_TARGETS_ARR[@]}" -gt 0 ]; then
      echo "Using sparse checkout for targets: ${SPARSE_TARGETS_ARR[*]}"
      if [ "${#EXCLUDE_PATTERNS_ARR[@]}" -gt 0 ]; then
        echo "Excluding patterns: ${EXCLUDE_PATTERNS_ARR[*]}"
      fi

      # Clone with blobless filter to download virtually no file contents initially
      git clone \
        --depth 1 \
        --single-branch \
        --no-tags \
        --shallow-submodules \
        --no-checkout \
        --filter=blob:none \
        "$SOURCE_ADDRESS" \
        "$SOURCE_DIR/repo"

      # Setup sparse checkout
      cd "$SOURCE_DIR/repo" || exit 1

      # Skip LFS files to avoid large binaries
      git config lfs.fetchexclude "*"

      # Configure partial clone to be more aggressive about not fetching objects
      git config core.preloadindex false
      git config core.fscache true
      git config gc.auto 0

      git sparse-checkout init --cone

      # Set sparse checkout targets
      git sparse-checkout set "${SPARSE_TARGETS_ARR[@]}"

      # Add exclusion patterns to sparse-checkout if specified
      if [ "${#EXCLUDE_PATTERNS_ARR[@]}" -gt 0 ]; then
        for pattern in "${EXCLUDE_PATTERNS_ARR[@]}"; do
          echo "!$pattern" >> .git/info/sparse-checkout
        done
      fi

      # Checkout only the sparse files (this will fetch only needed tree/blob objects)
      git checkout

      cd - > /dev/null || exit 1
    else
      echo "No sparse targets specified, performing full clone"
      # Regular full clone
      git clone \
        --depth 1 \
        --single-branch \
        --no-tags \
        --shallow-submodules \
        "$SOURCE_ADDRESS" \
        "$SOURCE_DIR/repo"
    fi
    
    rm -rf "$SOURCE_DIR/repo/.git"
    echo "Repository cloned successfully to $SOURCE_DIR/repo"
  else
    echo "Skipping non-repo source: $SOURCE_TYPE for $SOURCE_DIR"
  fi
else
  echo "Error: .source.env file not found in $SOURCE_DIR"
  exit 1
fi
