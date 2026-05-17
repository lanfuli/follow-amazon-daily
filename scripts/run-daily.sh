#!/usr/bin/env bash
# follow-amazon-daily — daily cron wrapper.
#
# The skill's value is the agent remix, so a real "automatic daily" run needs
# the agent in the loop. This wrapper:
#   1. runs prepare-digest.js (writes data/feed-amazon.json, emits blob;
#      filters against dedup state read-only — does NOT persist it)
#   2. has Claude Code (headless, time-bounded) remix the blob into
#      digest/<date>.md
#   3. if the Claude CLI is unavailable or times out, writes a clearly-labelled
#      RAW digest so delivery still produces something honest
#   4. delivers it via deliver.js using the configured channel
#   5. only AFTER successful delivery, marks those items seen (mark-seen.js) so
#      a failed run repeats content instead of silently losing it
#
# Install from onboarding, e.g. (8:00 America/Los_Angeles):
#   CRON_TZ=America/Los_Angeles
#   0 8 * * *  /Users/you/.claude/skills/follow-amazon-daily/scripts/run-daily.sh
#
# Secrets (TELEGRAM_BOT_TOKEN / RESEND_API_KEY / FEISHU_WEBHOOK[/_SECRET]) are
# read from ~/.follow-amazon-daily.env if present (cron has no shell profile).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="${FAD_LOG:-/tmp/fad-cron.log}"
BLOB="/tmp/fad-blob.json"
CLAUDE_TIMEOUT="${FAD_CLAUDE_TIMEOUT:-600}"

log() { echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] $*" >>"$LOG"; }

# Portable timeout (macOS has no `timeout`): fork the command, alarm the parent,
# kill the child if it overruns. perl is core on macOS and Linux.
run_with_timeout() {
  local secs="$1"
  shift
  perl -e '
    my $secs = shift @ARGV;
    my $pid = fork();
    if (!defined $pid) { exit 127; }
    if ($pid == 0) { exec @ARGV; exit 127; }
    $SIG{ALRM} = sub { kill("TERM",$pid); sleep 2; kill("KILL",$pid); exit 124; };
    alarm $secs;
    waitpid($pid,0);
    exit($? >> 8);
  ' "$secs" "$@"
}

cd "$SKILL_DIR" || { echo "cannot cd to $SKILL_DIR" >>"$LOG"; exit 1; }

# Load secrets for the cron environment (no shell profile under cron).
if [ -f "$HOME/.follow-amazon-daily.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$HOME/.follow-amazon-daily.env"
  set +a
fi

log "run start (skill=$SKILL_DIR)"

if ! node scripts/prepare-digest.js >"$BLOB" 2>>"$LOG"; then
  log "prepare-digest failed; aborting"
  exit 1
fi

DATE="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).date)' "$BLOB" 2>>"$LOG")"
if [ -z "$DATE" ]; then
  log "could not read date from blob; aborting"
  exit 1
fi
DIGEST="digest/$DATE.md"

REMIXED=0
if command -v claude >/dev/null 2>&1; then
  log "claude CLI found — remixing via agent (timeout ${CLAUDE_TIMEOUT}s)"
  if run_with_timeout "$CLAUDE_TIMEOUT" claude -p "Run the follow-amazon-daily daily workflow. Read $BLOB (already fetched — do NOT fetch anything yourself). Follow prompts/daily-digest.md, the prompts/summarize-*.md sub-prompts, and prompts/translate.md, honoring blob.config.language. Write the finished editorial digest to $DIGEST. Output nothing else." >>"$LOG" 2>&1 && [ -s "$DIGEST" ]; then
    REMIXED=1
  else
    log "agent remix failed or timed out — falling back to RAW"
  fi
fi

if [ "$REMIXED" -ne 1 ]; then
  log "writing labelled RAW fallback digest"
  node -e '
    const fs=require("fs");
    const b=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const cats=["Official / Policy","Seller Ops","Community Pain Signals","Podcast / Video Playbooks","Newsletter / Analyst Signals"];
    const L=[];
    L.push("# Amazon 卖家每日情报 (RAW) - "+b.date);
    L.push("");
    L.push("> ⚠️ RAW feed — NOT editorially remixed. The Claude CLI was unavailable or");
    L.push("> timed out on this cron run, so this is the structured feed without agent");
    L.push("> summaries. Run the follow-amazon-daily skill manually for the full digest.");
    L.push("");
    for(const c of cats){
      const its=b.items.filter(i=>i.category===c);
      L.push("## "+c);
      if(!its.length){L.push("- (no new signal)","");continue;}
      for(const it of its){
        L.push("- ["+it.title+"]("+it.url+")");
        if(it.excerpt) L.push("  - "+String(it.excerpt).slice(0,240));
      }
      L.push("");
    }
    fs.writeFileSync(process.argv[2], L.join("\n")+"\n");
  ' "$BLOB" "$DIGEST" 2>>"$LOG" || { log "raw fallback failed; aborting"; exit 1; }
fi

if node scripts/deliver.js --file "$DIGEST" >>"$LOG" 2>&1; then
  log "delivered $DIGEST (remixed=$REMIXED)"
  # Only now commit dedup state so a failed run repeats rather than loses items.
  if node scripts/mark-seen.js >>"$LOG" 2>&1; then
    log "state committed"
  else
    log "mark-seen failed (non-fatal — items may repeat next run)"
  fi
else
  log "delivery failed for $DIGEST — state NOT committed (will retry next run)"
  exit 1
fi

log "run done"
