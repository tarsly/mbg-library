#!/usr/bin/env bash
# strety.sh — Strety API helper.
# Handles OAuth token refresh, ETag If-Match on PATCH, and 429 backoff so
# skills can make one-line calls.
#
# Usage:
#   strety.sh GET    <path> [query]        strety.sh GET /todos "filter[completed]=false"
#   strety.sh POST   <path> <json-body>    strety.sh POST /todos '{"data":{...}}'
#   strety.sh PATCH  <path> <json-body>    (ETag fetched automatically)
#   strety.sh DELETE <path>
#   strety.sh WHOAMI                       (verifies credentials via GET /people)
#
# Credentials file (chmod 600): ~/.strety/credentials.json
#   { "client_id": "...", "client_secret": "...",
#     "access_token": "...", "refresh_token": "...", "saved_at_epoch": 0 }
set -euo pipefail

BASE="https://2.strety.com/api/v1"
CRED="${STRETY_CREDENTIALS:-$HOME/.strety/credentials.json}"
TOKEN_TTL=7200  # Strety access tokens live 2 hours

die() { echo "strety.sh error: $*" >&2; exit 1; }

[ -f "$CRED" ] || die "no credentials at $CRED — run /strety-setup first"
command -v jq >/dev/null || die "jq is required"

cred() { jq -r ".$1 // empty" "$CRED"; }

refresh_token() {
  local resp
  resp=$(curl -s -X POST "$BASE/oauth/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=refresh_token" \
    -d "refresh_token=$(cred refresh_token)" \
    -d "client_id=$(cred client_id)" \
    -d "client_secret=$(cred client_secret)")
  local access refresh
  access=$(echo "$resp" | jq -r '.access_token // empty')
  refresh=$(echo "$resp" | jq -r '.refresh_token // empty')
  [ -n "$access" ] || die "token refresh failed — re-run /strety-setup. Response: $resp"
  jq --arg a "$access" --arg r "${refresh:-$(cred refresh_token)}" --argjson t "$(date +%s)" \
    '.access_token=$a | .refresh_token=$r | .saved_at_epoch=$t' "$CRED" > "$CRED.tmp" \
    && mv "$CRED.tmp" "$CRED" && chmod 600 "$CRED"
}

ensure_fresh() {
  local saved now
  saved=$(cred saved_at_epoch); now=$(date +%s)
  if [ -z "$saved" ] || [ $((now - saved)) -ge $((TOKEN_TTL - 300)) ]; then
    refresh_token
  fi
}

# request METHOD PATH [QUERY_OR_BODY] — retries once on 401 (refresh) and on 429 (Retry-After)
request() {
  local method="$1" path="$2" extra="${3:-}" attempt url body_args=() hdr
  url="$BASE$path"
  case "$method" in
    GET|DELETE) [ -n "$extra" ] && url="$url?$extra" ;;
    POST|PATCH) body_args=(-H "Content-Type: application/vnd.api+json" -d "$extra") ;;
  esac
  if [ "$method" = "PATCH" ]; then
    hdr=$(curl -s -I -X GET "$url" -H "Authorization: Bearer $(cred access_token)" | tr -d '\r')
    local etag
    etag=$(echo "$hdr" | awk 'tolower($1)=="etag:" {print $2}')
    [ -n "$etag" ] && body_args+=(-H "If-Match: $etag")
  fi
  for attempt in 1 2 3; do
    local out http retry
    out=$(curl -s -w '\n%{http_code}' -X "$method" "$url" \
      -H "Authorization: Bearer $(cred access_token)" \
      -H "Accept: application/vnd.api+json" "${body_args[@]:-}")
    http=$(echo "$out" | tail -1)
    case "$http" in
      2*) echo "$out" | sed '$d'; return 0 ;;
      401) refresh_token ;;
      429) retry=$(echo "$out" | sed '$d' | jq -r '.retry_after // empty' 2>/dev/null)
           sleep "${retry:-10}" ;;
      412) die "412 Precondition Failed on $path — resource changed since ETag fetch; retry the operation" ;;
      *) die "HTTP $http on $method $path: $(echo "$out" | sed '$d')" ;;
    esac
  done
  die "gave up after 3 attempts on $method $path"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  GET|POST|PATCH|DELETE) ensure_fresh; request "$cmd" "$@" ;;
  WHOAMI) ensure_fresh; request GET /people "page[size]=5" ;;
  *) die "unknown command '$cmd' — use GET/POST/PATCH/DELETE/WHOAMI" ;;
esac
