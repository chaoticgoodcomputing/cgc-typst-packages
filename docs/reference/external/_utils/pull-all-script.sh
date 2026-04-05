#!/bin/bash

# Find all directories in the current directory that don't start with an underscore
for dir in */; do
  dir=${dir%/}
  
  # Skip directories that start with an underscore
  if [[ "$SOURCE_DIR" == _* ]]; then
    continue
  fi
  
  if [ -f "$SOURCE_DIR/.source.env" ]; then
    source "$SOURCE_DIR/.source.env"
    if [ "$SOURCE_TYPE" = "repo" ]; then
      echo "Pulling repository: $SOURCE_ADDRESS for $SOURCE_DIR"
      rm -rf "$SOURCE_DIR/repo"
      mkdir -p "$SOURCE_DIR/repo"
      git clone \
        --depth 1 \
        --single-branch \
        --no-tags \
        --shallow-submodules \
        "$SOURCE_ADDRESS" \
        "$SOURCE_DIR/repo"
      rm -rf "$SOURCE_DIR/repo/.git"
    else
      echo "Skipping non-repo source: $SOURCE_TYPE for $SOURCE_DIR"
    fi
  else
    echo "Error: .source.env file not found in $SOURCE_DIR"
  fi
done
