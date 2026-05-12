#!/bin/bash
# ipaShip CLI — Linux/macOS wrapper
# Supports: audit <file> and compare --file <f1> --file <f2>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-}"

usage() {
  cat <<'EOF'

  ipaShip CLI

  Commands:
    audit   <file-path> [api-key]     Audit an IPA/APK file via ipaship.com
    compare --file <f1> --file <f2>   Binary compare two files (Beyond-Compare style)

  Compare options:
    --format  text|json               Output format (default: text)
    --output  <file>                  Write result to file

  Examples:
    ipaship-cli.sh audit MyApp.ipa sk-abc123
    ipaship-cli.sh compare --file app-1.0.0.ipa --file app-1.0.1.ipa
    ipaship-cli.sh compare --file v1.apk --file v2.apk --format json --output diff.json

EOF
}

# ─── Audit ───────────────────────────────────────────────────────────────────

cmd_audit() {
  local file_path="${1:-}"
  local api_key="${2:-}"

  if [ -z "$file_path" ]; then
    echo "Usage: $0 audit <file-path> [api-key]" >&2
    exit 1
  fi

  if [ ! -f "$file_path" ]; then
    echo "Error: file not found: $file_path" >&2
    exit 1
  fi

  echo "Auditing $file_path via ipaship.com..."
  # curl -X POST https://ipaship.com/api/audit -F "file=@$file_path" -H "Authorization: Bearer $api_key"
}

# ─── Compare (pure bash, no external deps) ───────────────────────────────────

cmd_compare() {
  local files=()
  local format="text"
  local output=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --file)    files+=("$2"); shift 2 ;;
      --format)  format="$2";  shift 2 ;;
      --output)  output="$2";  shift 2 ;;
      --help|-h) usage; exit 0 ;;
      *) shift ;;
    esac
  done

  if [ ${#files[@]} -lt 2 ]; then
    echo "Error: provide --file twice." >&2
    usage
    exit 1
  fi

  local f1="${files[0]}"
  local f2="${files[1]}"

  for f in "$f1" "$f2"; do
    if [ ! -f "$f" ]; then
      echo "Error: file not found: $f" >&2
      exit 1
    fi
  done

  # ── Prefer Python wrapper if available ──────────────────────────────────────
  local py_compare="$SCRIPT_DIR/../python/ipaship_compare.py"
  if command -v python3 &>/dev/null && [ -f "$py_compare" ]; then
    python3 "$py_compare" --file "$f1" --file "$f2" --format "$format" ${output:+--output "$output"}
    return 0
  fi

  # ── Prefer Node.js wrapper if available ─────────────────────────────────────
  local node_compare="$SCRIPT_DIR/../npm/compare.js"
  if command -v node &>/dev/null && [ -f "$node_compare" ]; then
    node "$node_compare" compare --file "$f1" --file "$f2" --format "$format" ${output:+--output "$output"}
    return 0
  fi

  # ── Pure bash fallback ───────────────────────────────────────────────────────
  echo ""
  echo "  ipaShip Binary Compare"
  echo "  ────────────────────────────────────────────────────────────"

  local name1; name1=$(basename "$f1")
  local name2; name2=$(basename "$f2")
  local size1; size1=$(stat -c%s "$f1" 2>/dev/null || stat -f%z "$f1")
  local size2; size2=$(stat -c%s "$f2" 2>/dev/null || stat -f%z "$f2")
  local delta=$(( size2 - size1 ))

  echo "  File 1 : $name1  ($size1 bytes)"
  echo "  File 2 : $name2  ($size2 bytes)"
  echo "  Delta  : ${delta:+}$delta bytes"
  echo "  ────────────────────────────────────────────────────────────"

  # Hash comparison
  local hash1 hash2
  if command -v sha256sum &>/dev/null; then
    hash1=$(sha256sum "$f1" | awk '{print $1}')
    hash2=$(sha256sum "$f2" | awk '{print $1}')
  elif command -v shasum &>/dev/null; then
    hash1=$(shasum -a 256 "$f1" | awk '{print $1}')
    hash2=$(shasum -a 256 "$f2" | awk '{print $1}')
  else
    hash1="unavailable"
    hash2="unavailable"
  fi

  if [ "$hash1" = "$hash2" ]; then
    echo "  Identical  : YES"
  else
    echo "  Identical  : NO"
    echo "  Hash 1     : ${hash1:0:16}..."
    echo "  Hash 2     : ${hash2:0:16}..."
  fi

  # Archive comparison (IPA/APK/ZIP)
  local ext1="${f1##*.}"
  if [[ "$ext1" =~ ^(ipa|apk|zip|jar|aab)$ ]] && command -v unzip &>/dev/null; then
    echo "  ────────────────────────────────────────────────────────────"
    echo "  Archive Contents"

    local tmp1; tmp1=$(mktemp)
    local tmp2; tmp2=$(mktemp)
    unzip -v "$f1" 2>/dev/null | awk '/^[[:space:]]*[0-9]/{print $NF}' | sort > "$tmp1"
    unzip -v "$f2" 2>/dev/null | awk '/^[[:space:]]*[0-9]/{print $NF}' | sort > "$tmp2"

    local added; added=$(comm -13 "$tmp1" "$tmp2" | wc -l | tr -d ' ')
    local removed; removed=$(comm -23 "$tmp1" "$tmp2" | wc -l | tr -d ' ')
    local common; common=$(comm -12 "$tmp1" "$tmp2" | wc -l | tr -d ' ')

    echo "  Added   : $added"
    echo "  Removed : $removed"
    echo "  Common  : $common"

    if [ "$added" -gt 0 ]; then
      echo "  -- Added files --"
      comm -13 "$tmp1" "$tmp2" | head -20 | while read -r line; do echo "    [+] $line"; done
    fi
    if [ "$removed" -gt 0 ]; then
      echo "  -- Removed files --"
      comm -23 "$tmp1" "$tmp2" | head -20 | while read -r line; do echo "    [-] $line"; done
    fi

    rm -f "$tmp1" "$tmp2"
  fi

  echo ""
}

# ─── Main Dispatch ───────────────────────────────────────────────────────────

case "$COMMAND" in
  audit)   shift; cmd_audit "$@" ;;
  compare) shift; cmd_compare "$@" ;;
  --help|-h|help) usage ;;
  *)
    echo "Unknown command: '$COMMAND'" >&2
    usage
    exit 1
    ;;
esac
