#!/bin/sh
set -eu

session_data_path="${SESSION_DATA_PATH:-/app/data/sessions}"

if [ -d "$session_data_path" ]; then
  find "$session_data_path" \
    \( -name SingletonLock -o -name SingletonCookie -o -name SingletonSocket \) \
    -delete
fi

exec dumb-init -- node dist/main
