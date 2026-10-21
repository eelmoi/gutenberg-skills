#!/usr/bin/env bash
# Install WebAula Gutenberg skills for Claude Code.
# Default: global install (~/.claude/skills), kept up to date. Claude Code then
# checks GitHub at the start of each session and, when main has moved,
# fast-forwards this clone and copies the skills again (tools/auto-update.mjs).
# --no-auto-update installs globally without that check, and turns it off if it
# was on. --project installs into the current repo's .claude/skills, with no
# check. --list prints what would be installed. Anything else is an error.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

skills() {
  for dir in "$SCRIPT_DIR"/skills/*/; do
    [ -f "$dir/SKILL.md" ] || continue
    basename "$dir"
  done
}

TARGET="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"
AUTO_UPDATE=on
case "${1:-}" in
  --list)
    skills
    exit 0
    ;;
  --project)
    TARGET=".claude/skills"
    AUTO_UPDATE=none
    ;;
  --no-auto-update)
    AUTO_UPDATE=off
    ;;
  "")
    ;;
  *)
    echo "Usage: $0 [--list | --project | --no-auto-update]" >&2
    exit 1
    ;;
esac

mkdir -p "$TARGET"

# Discovered from the directory rather than hardcoded, so adding a skill needs
# no edit here. A glob loop rather than a pipeline, so names never word-split
# and the counter is not lost to a subshell.
count=0
for dir in "$SCRIPT_DIR"/skills/*/; do
  [ -f "$dir/SKILL.md" ] || continue
  skill="$(basename "$dir")"
  rm -rf "$TARGET/$skill"
  cp -r "$SCRIPT_DIR/skills/$skill" "$TARGET/$skill"
  echo "Installed: $TARGET/$skill"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "no skills found under skills/" >&2
  exit 1
fi

# The check is a Node script, not a shell one: the tools need Node anyway, and
# a node command runs the same whichever shell Claude Code uses for hooks.
if [ "$AUTO_UPDATE" != none ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js not found: the skills are installed, but automatic updates need Node 20 or newer." >&2
  elif [ "$AUTO_UPDATE" = on ]; then
    node "$SCRIPT_DIR/tools/auto-update.mjs" --register || true
  else
    node "$SCRIPT_DIR/tools/auto-update.mjs" --unregister || true
  fi
fi

echo "Done. Claude Code will pick these up automatically."
