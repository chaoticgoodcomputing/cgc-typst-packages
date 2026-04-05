#!/bin/bash

echo "Available external sources:"
for dir in */; do
  dir=${dir%/}
  
  # Skip directories that start with an underscore
  if [[ "$dir" == _* ]]; then
    continue
  fi
  
  echo "$dir"
done
