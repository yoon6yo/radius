#!/usr/bin/env bash
set -euo pipefail
exec python3 -I "$(dirname "${BASH_SOURCE[0]}")/filter-test-output.py"
