import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkForUpdate,
  describe as describeResult,
  hookCommand,
  installSkills,
  registerHook,
  unregisterHook
} from "../tools/auto-update.mjs";

const cliPath = fileURLToPath(new URL("../tools/auto-update.mjs", import.meta.url));

// CI runners have no git identity, and commits in the fixtures need one.
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid"
};

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnv }).trim();
}

function write(dir, path, text) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/**
 * A bare repo standing in for GitHub, a maintainer's working copy that
 * publishes to it, and a teammate's clone with an empty skills folder.
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gutenberg-skills-update-"));
  const origin = join(root, "origin.git");
  const maintainer = join(root, "maintainer");
  const clone = join(root, "clone");
  const target = join(root, "skills-installed");

  git(root, "init", "--quiet", "--bare", "--initial-branch=main", origin);
  mkdirSync(maintainer);
  git(maintainer, "init", "--quiet", "--initial-branch=main");
  // As in the real repo: without it, Git for Windows checks out CRLF.
  write(maintainer, ".gitattributes", "* text=auto eol=lf\n");
  write(maintainer, "skills/demo/SKILL.md", "v1\n");
  write(maintainer, "package-lock.json", "{}\n");
  git(maintainer, "add", ".");
  git(maintainer, "commit", "--quiet", "-m", "first");
  git(maintainer, "remote", "add", "origin", origin);
  git(maintainer, "push", "--quiet", "origin", "main");
  git(root, "clone", "--quiet", origin, clone);

  return {
    root,
    origin,
    clone,
    target,
    publish(path, text, message = `change ${path}`) {
      write(maintainer, path, text);
      git(maintainer, "add", ".");
      git(maintainer, "commit", "--quiet", "-m", message);
      git(maintainer, "push", "--quiet", "origin", "main");
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

const always = { GUTENBERG_SKILLS_UPDATE_INTERVAL: "0" };

test("a clone behind GitHub's main is fast-forwarded and its skills reinstalled", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  f.publish("skills/demo/SKILL.md", "v2\n", "second");

  const result = checkForUpdate({ repo: f.clone, target: f.target, env: always });

  assert.equal(result.status, "updated");
  assert.equal(result.commits, 1);
  assert.equal(result.dependenciesChanged, false);
  assert.equal(git(f.clone, "rev-parse", "HEAD"), git(f.origin, "rev-parse", "main"));
  assert.equal(readFileSync(join(f.target, "demo", "SKILL.md"), "utf8"), "v2\n");
  assert.match(describeResult(result), /updated to [0-9a-f]{7} \(1 new commit, latest: second\)/);
});

test("a current clone installs once, then says nothing", (t) => {
  const f = fixture();
  t.after(f.cleanup);

  const first = checkForUpdate({ repo: f.clone, target: f.target, env: always });
  assert.equal(first.status, "reinstalled");
  assert.equal(readFileSync(join(f.target, "demo", "SKILL.md"), "utf8"), "v1\n");

  const second = checkForUpdate({ repo: f.clone, target: f.target, env: always });
  assert.equal(second.status, "up-to-date");
  assert.equal(describeResult(second), "");
});

test("uncommitted changes in the clone are left alone", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  f.publish("skills/demo/SKILL.md", "v2\n");
  write(f.clone, "skills/demo/SKILL.md", "local edit\n");

  const result = checkForUpdate({ repo: f.clone, target: f.target, env: always });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /uncommitted changes/);
  assert.equal(readFileSync(join(f.clone, "skills", "demo", "SKILL.md"), "utf8"), "local edit\n");
  assert.equal(existsSync(f.target), false);
  assert.match(describeResult(result), /was not updated/);
});

test("a clone on another branch is left alone, and says so when main moved", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  git(f.clone, "checkout", "--quiet", "-b", "work");
  f.publish("skills/demo/SKILL.md", "v2\n");

  const result = checkForUpdate({ repo: f.clone, target: f.target, env: always });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /on work, not main/);
  assert.equal(git(f.clone, "rev-parse", "--abbrev-ref", "HEAD"), "work");
});

test("a branch that already has everything on main stays silent", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  git(f.clone, "checkout", "--quiet", "-b", "work");

  const result = checkForUpdate({ repo: f.clone, target: f.target, env: always });

  assert.equal(result.status, "up-to-date");
  assert.equal(describeResult(result), "");
});

test("commits that GitHub does not have are left alone", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  write(f.clone, "notes.txt", "mine\n");
  git(f.clone, "add", ".");
  git(f.clone, "commit", "--quiet", "-m", "local only");
  const local = git(f.clone, "rev-parse", "HEAD");
  f.publish("skills/demo/SKILL.md", "v2\n");

  const result = checkForUpdate({ repo: f.clone, target: f.target, env: always });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /commits that are not on GitHub's main/);
  assert.equal(git(f.clone, "rev-parse", "HEAD"), local);
});

test("no network is silent and changes nothing", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  rmSync(f.origin, { recursive: true, force: true });

  const result = checkForUpdate({ repo: f.clone, target: f.target, env: always });

  assert.equal(result.status, "offline");
  assert.equal(describeResult(result), "");
});

test("a dependency change is reported so npm ci can be run", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  f.publish("package-lock.json", '{ "lockfileVersion": 3 }\n', "bump dependencies");

  const result = checkForUpdate({ repo: f.clone, target: f.target, env: always });

  assert.equal(result.status, "updated");
  assert.equal(result.dependenciesChanged, true);
  assert.match(describeResult(result, f.clone), /run `npm ci` in /);
});

test("a second check within the interval does not fetch again", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const hourly = { GUTENBERG_SKILLS_UPDATE_INTERVAL: "60" };

  assert.notEqual(checkForUpdate({ repo: f.clone, target: f.target, env: hourly }).status, "throttled");
  f.publish("skills/demo/SKILL.md", "v2\n");
  assert.equal(checkForUpdate({ repo: f.clone, target: f.target, env: hourly }).status, "throttled");
});

test("GUTENBERG_SKILLS_NO_UPDATE turns the check off", (t) => {
  const f = fixture();
  t.after(f.cleanup);
  f.publish("skills/demo/SKILL.md", "v2\n");

  const result = checkForUpdate({ repo: f.clone, target: f.target, env: { GUTENBERG_SKILLS_NO_UPDATE: "1" } });

  assert.equal(result.status, "disabled");
  assert.equal(readFileSync(join(f.clone, "skills", "demo", "SKILL.md"), "utf8"), "v1\n");
});

test("installing replaces each skill whole and skips directories without SKILL.md", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gutenberg-skills-install-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  const target = join(root, "target");
  write(repo, "skills/demo/SKILL.md", "new\n");
  write(repo, "skills/not-a-skill/README.md", "notes\n");
  write(target, "demo/SKILL.md", "old\n");
  write(target, "demo/removed-upstream.md", "stale\n");

  assert.deepEqual(installSkills(repo, target), ["demo"]);
  assert.equal(readFileSync(join(target, "demo", "SKILL.md"), "utf8"), "new\n");
  assert.equal(existsSync(join(target, "demo", "removed-upstream.md")), false);
  assert.equal(existsSync(join(target, "not-a-skill")), false);
});

function settingsFixture(t, initial) {
  const dir = mkdtempSync(join(tmpdir(), "gutenberg-skills-settings-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "settings.json");
  if (initial !== undefined) writeFileSync(path, typeof initial === "string" ? initial : JSON.stringify(initial));
  return path;
}

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const ourHooks = (settings) =>
  (settings.hooks?.SessionStart ?? []).flatMap((entry) => entry.hooks).filter((h) => /auto-update\.mjs/.test(h.command));

test("registering adds one startup hook and keeps everything else", (t) => {
  const other = { type: "command", command: "echo hello" };
  const path = settingsFixture(t, {
    model: "opus",
    hooks: { SessionStart: [{ matcher: "startup", hooks: [other] }], Stop: [{ hooks: [other] }] }
  });
  const command = hookCommand("D:\\Work\\gutenberg-skills");

  registerHook({ path, command });
  registerHook({ path, command });
  const settings = read(path);

  assert.equal(settings.model, "opus");
  assert.deepEqual(settings.hooks.Stop, [{ hooks: [other] }]);
  assert.deepEqual(ourHooks(settings), [{ type: "command", command, timeout: 30 }]);
  assert.deepEqual(settings.hooks.SessionStart[0], { matcher: "startup", hooks: [other] });
  assert.equal(settings.hooks.SessionStart.at(-1).matcher, "startup");
});

test("the hook command runs node on the quoted script path, with forward slashes", () => {
  assert.equal(
    hookCommand("D:\\Work\\Claude work\\gutenberg-skills"),
    'node "D:/Work/Claude work/gutenberg-skills/tools/auto-update.mjs"'
  );
});

test("registering again from a moved clone replaces the old hook", (t) => {
  const path = settingsFixture(t);
  registerHook({ path, command: hookCommand("/old/place") });
  registerHook({ path, command: hookCommand("/new/place") });

  assert.deepEqual(
    ourHooks(read(path)).map((h) => h.command),
    ['node "/new/place/tools/auto-update.mjs"']
  );
});

test("unregistering removes only this hook", (t) => {
  const other = { type: "command", command: "echo hello" };
  const path = settingsFixture(t, { hooks: { SessionStart: [{ matcher: "startup", hooks: [other] }] } });
  registerHook({ path, command: hookCommand("/repo") });

  assert.equal(unregisterHook({ path }), true);
  assert.deepEqual(read(path), { hooks: { SessionStart: [{ matcher: "startup", hooks: [other] }] } });
});

test("unregistering the only hook leaves no empty hooks object", (t) => {
  const path = settingsFixture(t, { model: "opus" });
  registerHook({ path, command: hookCommand("/repo") });
  unregisterHook({ path });

  assert.deepEqual(read(path), { model: "opus" });
});

test("a settings file that does not parse is never overwritten", (t) => {
  const broken = '{ "model": "opus", }';
  const path = settingsFixture(t, broken);

  assert.throws(() => registerHook({ path, command: "node x" }));
  assert.equal(readFileSync(path, "utf8"), broken);
});

test("the hook itself exits 0 and prints nothing when switched off", () => {
  const result = spawnSync(process.execPath, [cliPath], {
    encoding: "utf8",
    env: { ...process.env, GUTENBERG_SKILLS_NO_UPDATE: "1" }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
