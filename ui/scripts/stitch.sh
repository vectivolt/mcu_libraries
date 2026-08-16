#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# VectiSuite UI · stitch helper
# Author: Chinmoy Bhuyan <chinmoy@joulepoint.com>  (c) 2026 VectiVolt — Apache-2.0
# ---------------------------------------------------------------------------
#
# Thin wrapper around the Google Stitch MCP server. Each subcommand POSTs
# a JSON-RPC request to https://stitch.googleapis.com/mcp and returns the
# pretty-printed result. Designed to be called from other scripts.
#
#   ./stitch.sh tools-list
#   ./stitch.sh call create_project '{"title":"VectiSuite"}'
#   ./stitch.sh call generate_screen_from_text '{"projectId":"…","prompt":"…","device":"DESKTOP"}'

set -u
URL="https://stitch.googleapis.com/mcp"
KEY="${STITCH_API_KEY:?set STITCH_API_KEY first}"
ID=${RANDOM}

rpc() {
  /usr/bin/curl -s --max-time 60 \
    -H "X-Goog-Api-Key: $KEY" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -X POST -d "$1" "$URL"
}

case "${1:-help}" in
  tools-list)
    rpc "{\"jsonrpc\":\"2.0\",\"id\":$ID,\"method\":\"tools/list\"}" \
      | /opt/homebrew/bin/python3 -c "import json,sys; d=json.load(sys.stdin); [print(t['name'].ljust(36), '—', t.get('description','').split(chr(10))[0][:90]) for t in d.get('result',{}).get('tools',[])]"
    ;;
  schema)
    rpc "{\"jsonrpc\":\"2.0\",\"id\":$ID,\"method\":\"tools/list\"}" \
      | /opt/homebrew/bin/python3 -c "
import json,sys
d=json.load(sys.stdin); name='${2:?tool name}'
for t in d.get('result',{}).get('tools',[]):
    if t['name']==name:
        print(json.dumps(t.get('inputSchema',{}), indent=2)); break
else:
    print('no such tool', file=sys.stderr); sys.exit(1)
"
    ;;
  call)
    local_tool="${2:?tool name}"
    # NOT "${3:-{}}" — the shell ends the expansion at the first `}`, so that
    # form appends a stray `}` to whatever the caller passed and every
    # non-default argument reached the server as malformed JSON.
    local_args="$3"
    [ -n "$local_args" ] || local_args='{}'
    rpc "{\"jsonrpc\":\"2.0\",\"id\":$ID,\"method\":\"tools/call\",\"params\":{\"name\":\"$local_tool\",\"arguments\":$local_args}}" \
      | /opt/homebrew/bin/python3 -m json.tool
    ;;
  *)
    echo "Usage: $0 tools-list | schema <tool> | call <tool> <json-args>"
    exit 1
    ;;
esac
