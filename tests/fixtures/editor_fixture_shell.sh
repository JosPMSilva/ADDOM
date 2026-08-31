#!/usr/bin/env bash

set -euo pipefail

name="${1:-fixture}"
printf 'hello %s\n' "$name"
