#!/usr/bin/env node
/**
 * Keep this clone and the installed skills on GitHub's latest main.
 *
 * install.sh registers this file as a Claude Code SessionStart hook, so it runs
 * whenever a session starts. It is the version check: it fetches main, and if
 * GitHub is ahead it fast-forwards the clone and copies the skills into
 * ~/.claude/skills again, the same way install.sh does.
 *
 * It only ever fast-forwards. A clone with uncommitted changes, another branch
 * checked out, or commits GitHub does not have is left exactly as it is, and
 * the hook says why. It never fails the session: every path exits 0.
 *
 *   node tools/auto-update.mjs               check and update (the hook)
 *   node tools/auto-update.mjs --register    add the hook to settings.json
 *   node tools/auto-update.mjs --unregister  remove it again
 *
 * GUTENBERG_SKILLS_NO_UPDATE=1 turns the check off without touching settings.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const BRANCH = "main";

/** Minutes between two checks, so a burst of new sessions fetches once. */
const DEFAULT_INTERVAL_MINUTES = 10;

/** A lock older than this was left by a run that was killed. */
const STALE_LOCK_MS = 10 * 60 * 1000;

/** The hook's own budget. Claude Code stops waiting for it after this. */
const HOOK_TIMEOUT_SECONDS = 30;

/** Where Claude Code keeps settings.json and skills/, as install.sh sees it. */
function configDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

function git(repo, args, options = {}) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Never stop to ask for credentials: the repo is public, and a prompt
      // would hold the session start until the hook timed out.
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never"
    },
    ...options
  }).trim();
}

/**
 * Copy every skill under skills/ into target, one directory per skill. Same
 * rule as install.sh: a directory counts when it has a SKILL.md. Each skill is
 * copied beside its old copy first and swapped in, so a session reading it
 * never finds the directory half written.
 */
export function installSkills(repo, target) {
  mkdirSync(target, { recursive: true });

  const installed = [];
  for (const entry of readdirSync(join(repo, "skills"), { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(join(repo, "skills", entry.name, "SKILL.md"))) continue;

    const dest = join(target, entry.name);
    const fresh = join(target, `.${entry.name}.updating`);
    rmSync(fresh, { recursive: true, force: true });
    cpSync(join(repo, "skills", entry.name), fresh, { recursive: true });
    rmSync(dest, { recursive: true, force: true });
    renameSync(fresh, dest);
    installed.push(entry.name);
  }

  return installed;
}

function holdLock(lockPath) {
  try {
    closeSync(openSync(lockPath, "wx"));
    return true;
  } catch {
    // Another session is updating right now, unless that run was killed and
    // left its lock behind.
    try {
      if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
        rmSync(lockPath, { force: true });
        closeSync(openSync(lockPath, "wx"));
        return true;
      }
    } catch {
      // Lost the race to the other session; it will do the update.
    }
    return false;
  }
}

function checkedRecently(stampPath, intervalMinutes) {
  if (intervalMinutes <= 0 || !existsSync(stampPath)) return false;
  return Date.now() - statSync(stampPath).mtimeMs < intervalMinutes * 60 * 1000;
}

function touch(path) {
  const now = new Date();
  try {
    utimesSync(path, now, now);
  } catch {
    writeFileSync(path, "");
  }
}

/** The commit whose skills were last copied into target, if any. */
function installedRevision(gitDir) {
  try {
    return readFileSync(join(gitDir, "gutenberg-skills-installed"), "utf8").trim();
  } catch {
    return "";
  }
}

function recordInstalled(gitDir, revision) {
  writeFileSync(join(gitDir, "gutenberg-skills-installed"), revision + "\n");
}

/**
 * Tell the next check that target already holds the skills of the clone's
 * current commit, so it does not copy them again. install.sh calls this
 * through --register right after its own copy.
 */
export function markInstalled(repo = REPO) {
  recordInstalled(git(repo, ["rev-parse", "--absolute-git-dir"]), git(repo, ["rev-parse", "HEAD"]));
}

/**
 * The check itself. Returns what happened, and prints nothing, so the hook and
 * the tests read the same result.
 *
 * status is one of: disabled, not-a-clone, throttled, busy, offline,
 * up-to-date, skipped (with a reason), reinstalled, updated.
 */
export function checkForUpdate({
  repo = REPO,
  target = join(configDir(), "skills"),
  env = process.env,
  fetchTimeoutMs = 20000
} = {}) {
  if (env.GUTENBERG_SKILLS_NO_UPDATE) return { status: "disabled" };

  let gitDir;
  try {
    gitDir = git(repo, ["rev-parse", "--absolute-git-dir"]);
  } catch {
    return { status: "not-a-clone" };
  }

  const interval = Number(env.GUTENBERG_SKILLS_UPDATE_INTERVAL ?? DEFAULT_INTERVAL_MINUTES);
  const stampPath = join(gitDir, "gutenberg-skills-last-check");
  if (checkedRecently(stampPath, Number.isFinite(interval) ? interval : DEFAULT_INTERVAL_MINUTES)) {
    return { status: "throttled" };
  }

  const lockPath = join(gitDir, "gutenberg-skills-update.lock");
  if (!holdLock(lockPath)) return { status: "busy" };

  try {
    try {
      git(
        repo,
        ["-c", "http.lowSpeedLimit=1000", "-c", "http.lowSpeedTime=10", "fetch", "--quiet", "origin", BRANCH],
        { timeout: fetchTimeoutMs }
      );
    } catch {
      // No network, or GitHub is slow: try again at the next session.
      return { status: "offline" };
    }
    touch(stampPath);

    const from = git(repo, ["rev-parse", "HEAD"]);
    const to = git(repo, ["rev-parse", "FETCH_HEAD"]);

    let branch = "";
    try {
      branch = git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    } catch {
      // Detached HEAD: treated like any other branch that is not main.
    }
    if (branch !== BRANCH) {
      // Someone working on a branch in this clone keeps it. They only hear
      // about it when GitHub's main has something the branch does not.
      if (contains(repo, from, to)) return { status: "up-to-date", from };
      return { status: "skipped", reason: `the clone is on ${branch || "a detached HEAD"}, not ${BRANCH}` };
    }

    if (from === to) {
      // The clone is current. Its skills may still not be in target: a copy
      // that failed last time, or a git pull made by hand without install.sh.
      if (installedRevision(gitDir) === from) return { status: "up-to-date", from };
      const skills = installSkills(repo, target);
      recordInstalled(gitDir, from);
      return { status: "reinstalled", to: from, skills };
    }

    if (!contains(repo, to, from)) {
      return { status: "skipped", reason: "the clone has commits that are not on GitHub's main" };
    }

    if (git(repo, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
      return { status: "skipped", reason: "the clone has uncommitted changes" };
    }

    const lockBefore = blobId(repo, "HEAD");
    git(repo, ["merge", "--ff-only", "--quiet", "FETCH_HEAD"]);
    const lockAfter = blobId(repo, "HEAD");

    const skills = installSkills(repo, target);
    recordInstalled(gitDir, to);
    const subject = git(repo, ["log", "-1", "--format=%s"]);
    const commits = Number(git(repo, ["rev-list", "--count", `${from}..${to}`]));

    return {
      status: "updated",
      from,
      to,
      subject,
      commits,
      skills,
      dependenciesChanged: lockBefore !== lockAfter
    };
  } finally {
    rmSync(lockPath, { force: true });
  }
}

/** Whether commit `outer` already contains commit `inner`. */
function contains(repo, outer, inner) {
  try {
    git(repo, ["merge-base", "--is-ancestor", inner, outer]);
    return true;
  } catch {
    return false;
  }
}

function blobId(repo, rev) {
  try {
    return git(repo, ["rev-parse", `${rev}:package-lock.json`]);
  } catch {
    return "";
  }
}

/** What the person and Claude are told. Silence when nothing changed. */
export function describe(result, repo = REPO) {
  if (result.status === "updated") {
    const lines = [
      `gutenberg-skills updated to ${result.to.slice(0, 7)} (${result.commits} new ` +
        `commit${result.commits === 1 ? "" : "s"}, latest: ${result.subject}).`
    ];
    if (result.dependenciesChanged) {
      lines.push(`Its dependencies changed: run \`npm ci\` in ${repo} before using the tools.`);
    }
    return lines.join(" ");
  }
  if (result.status === "reinstalled") {
    return `gutenberg-skills reinstalled from the clone at ${result.to.slice(0, 7)}.`;
  }
  if (result.status === "skipped") {
    return `gutenberg-skills was not updated: ${result.reason}. The skills stay as they are.`;
  }
  return "";
}

function settingsPath(env = process.env) {
  return join(configDir(env), "settings.json");
}

/** Forward slashes work in bash, cmd and PowerShell alike, and survive JSON. */
function slashes(path) {
  return path.replace(/\\/g, "/");
}

/**
 * Plain `node`, not the absolute path of the node running this: that path is
 * per version under nvm and Volta and breaks on the next upgrade, while hooks
 * run with the same PATH the skills' own `node tools/...` commands use.
 */
export function hookCommand(repo = REPO) {
  return `node "${slashes(join(repo, "tools", "auto-update.mjs"))}"`;
}

const OURS = /tools\/auto-update\.mjs"?\s*$/;

function readSettings(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  if (text.trim() === "") return {};
  // A settings file that does not parse is left untouched: writing over it
  // would lose whatever the person had there.
  return JSON.parse(text);
}

function withoutOurHook(entries) {
  return (entries ?? [])
    .map((entry) => ({ ...entry, hooks: (entry.hooks ?? []).filter((h) => !OURS.test(h.command ?? "")) }))
    .filter((entry) => entry.hooks.length > 0);
}

/**
 * Add the hook to settings.json, or move it if the clone moved. Everything
 * else in the file is kept as it was.
 */
export function registerHook({ path = settingsPath(), command = hookCommand() } = {}) {
  const settings = readSettings(path);
  const hooks = settings.hooks ?? {};

  const sessionStart = withoutOurHook(hooks.SessionStart);
  sessionStart.push({
    matcher: "startup",
    hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT_SECONDS }]
  });

  const next = { ...settings, hooks: { ...hooks, SessionStart: sessionStart } };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  return path;
}

/** Take the hook out again, leaving any other SessionStart hooks in place. */
export function unregisterHook({ path = settingsPath() } = {}) {
  if (!existsSync(path)) return false;
  const settings = readSettings(path);
  if (!settings.hooks?.SessionStart) return false;

  const sessionStart = withoutOurHook(settings.hooks.SessionStart);
  const hooks = { ...settings.hooks };
  if (sessionStart.length > 0) hooks.SessionStart = sessionStart;
  else delete hooks.SessionStart;

  const next = { ...settings };
  if (Object.keys(hooks).length > 0) next.hooks = hooks;
  else delete next.hooks;

  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  return true;
}

function main(argv) {
  if (argv.includes("--register")) {
    try {
      git(REPO, ["rev-parse", "--absolute-git-dir"]);
    } catch {
      process.stderr.write(
        "Automatic updates need a git clone of the repo, and this copy is not one. " +
          "Clone it from GitHub and run ./install.sh there.\n"
      );
      process.exitCode = 1;
      return;
    }
    try {
      // The skills install.sh just copied are this commit's, so the first
      // check has nothing to copy again.
      markInstalled();
      const path = registerHook();
      process.stdout.write(`Automatic updates on: Claude Code checks GitHub at the start of each session (${path}).\n`);
    } catch (error) {
      process.stderr.write(`Could not turn on automatic updates: ${error.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (argv.includes("--unregister")) {
    try {
      if (unregisterHook()) process.stdout.write("Automatic updates off.\n");
    } catch (error) {
      process.stderr.write(`Could not turn off automatic updates: ${error.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  // The hook. Whatever happens, the session starts.
  let message = "";
  try {
    message = describe(checkForUpdate());
  } catch (error) {
    message = `gutenberg-skills update check failed: ${error.message}`;
  }

  if (message) {
    process.stdout.write(
      JSON.stringify({
        systemMessage: message,
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message }
      }) + "\n"
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
