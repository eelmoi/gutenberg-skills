import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scaffoldFiles } from "../tools/scaffold-theme.mjs";
import { buildThemeJson, serialize } from "../tools/build-theme-json.mjs";

const examplePath = fileURLToPath(
  new URL("../examples/agency-site/input/design-system.json", import.meta.url)
);
const expectedThemeDir = fileURLToPath(
  new URL("../examples/agency-site/expected/theme", import.meta.url)
);
const cliPath = fileURLToPath(new URL("../tools/scaffold-theme.mjs", import.meta.url));

const example = JSON.parse(readFileSync(examplePath));

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out.sort();
}

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

test("the file list matches the structure the skill prescribes", () => {
  assert.deepEqual([...scaffoldFiles(example).keys()].sort(), [
    "CLAUDE.md",
    "assets/.gitkeep",
    "functions.php",
    "inc/cpt.php",
    "inc/enqueue.php",
    "inc/menus.php",
    "parts/footer.html",
    "parts/header.html",
    "patterns/README.md",
    "style.css",
    "templates/front-page.html",
    "templates/index.html",
    "templates/page.html",
    "templates/single.html",
    "theme.json"
  ]);
});

// Stage 5 authors the designed sections into the example theme, so the example
// is a superset of the scaffold. These are the files authoring owns, including
// the two seed files the scaffold writes once and never overwrites. Everything
// else must still be byte for byte what the scaffold writes, which is what
// stops a hand edit from drifting into the generated half.
const AUTHORED = [
  "CLAUDE.md",
  "patterns/about-media-text.php",
  "patterns/cta-band.php",
  "patterns/faq.php",
  "patterns/hero.php",
  "patterns/services-grid.php",
  "templates/front-page.html"
];

test("the committed example theme is the scaffold plus the authored sections", () => {
  const files = scaffoldFiles(example);
  const expectedFiles = [...new Set([...files.keys(), ...AUTHORED])].sort();
  assert.deepEqual(walk(expectedThemeDir), expectedFiles);

  for (const [name, contents] of files) {
    if (AUTHORED.includes(name)) continue;
    const onDisk = readFileSync(join(expectedThemeDir, name), "utf8").replace(/\r\n/g, "\n");
    assert.equal(contents, onDisk, `${name} differs`);
  }
});

test("theme.json is delegated to the generator, not written twice", () => {
  assert.equal(scaffoldFiles(example).get("theme.json"), serialize(buildThemeJson(example)));
});

test("output is deterministic across runs", () => {
  const a = [...scaffoldFiles(example)].map(([k, v]) => k + v).join("");
  const b = [...scaffoldFiles(example)].map(([k, v]) => k + v).join("");
  assert.equal(a, b);
});

test("style.css carries the headers WordPress requires to see a block theme", () => {
  const css = scaffoldFiles(example).get("style.css");
  assert.match(css, /Theme Name: Agency Site/);
  assert.match(css, /Text Domain: agency-site/);
  assert.match(css, /Requires at least: 7\.0/);
});

test("template parts omit the theme attribute, core injects the directory name", () => {
  const files = scaffoldFiles(example);
  for (const name of [
    "templates/front-page.html",
    "templates/index.html",
    "templates/page.html",
    "templates/single.html"
  ]) {
    const contents = files.get(name);
    assert.match(contents, /"slug":"header"/, `${name} lost its header part`);
    assert.match(contents, /"slug":"footer"/, `${name} lost its footer part`);
    assert.equal(contents.includes('"theme":'), false, `${name} pins a theme directory`);
  }
});

test("parts are plain divs, the template-part block supplies the semantic element", () => {
  const files = scaffoldFiles(example);
  for (const name of ["parts/header.html", "parts/footer.html"]) {
    const part = files.get(name);
    assert.equal(part.includes("tagName"), false, `${name} sets tagName`);
    assert.equal(/<header|<footer/.test(part), false, `${name} repeats the wrapper element`);
  }
  const index = files.get("templates/index.html");
  assert.match(index, /"tagName":"header"/);
  assert.match(index, /"tagName":"footer"/);
});

test("no template carries a raw hex value", () => {
  for (const [name, contents] of scaffoldFiles(example)) {
    if (!name.endsWith(".html")) continue;
    assert.equal(/#[0-9a-fA-F]{6}\b/.test(contents), false, `${name} carries hex`);
  }
});

test("CLAUDE.md is seeded with the real slugs, so the next session starts informed", () => {
  const claude = scaffoldFiles(example).get("CLAUDE.md");
  for (const colour of example.palette) assert.match(claude, new RegExp(`\\b${colour.slug}\\b`));
  // The pipes are GFM-escaped so the spacing table survives rendering.
  assert.match(claude, /var:preset\\\|spacing\\\|50/);
  assert.equal(/`var:preset\|/.test(claude), false, "a bare pipe splits the table cell");
  assert.match(claude, /720px/);
  // Classes and custom properties carry the kebab-cased slug, not the raw one.
  assert.match(claude, /\| `h2` \| 1\.875rem \| `has-h-2-font-size` \|/);
  assert.match(claude, /\| `var\(--wp--preset--spacing--50\)` \|/);
});

test("a meta.name needing escaping cannot break the generated files", () => {
  const doc = structuredClone(example);
  doc.meta.name = "O'Brien & Co";
  const files = scaffoldFiles(doc);

  assert.match(files.get("functions.php"), /__\( 'O\\'Brien & Co', 'agency-site' \)/);
  assert.match(files.get("parts/footer.html"), /O'Brien &amp; Co</);

  // With comments removed, every single-quoted literal strips cleanly. A raw
  // apostrophe inside one leaves an unpaired quote behind.
  for (const [name, contents] of files) {
    if (!name.endsWith(".php")) continue;
    const noComments = contents.replace(/\/\*[^]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const stripped = noComments.replace(/'(?:[^'\\]|\\[^])*'/g, "");
    assert.equal(stripped.includes("'"), false, `${name} has a raw quote inside a literal`);
  }
});

test("functions.php registers patterns from the patterns directory", () => {
  const php = scaffoldFiles(example).get("functions.php");
  assert.match(php, /agency_site_/);
  assert.match(php, /require_once/);
  assert.equal(php.startsWith("<?php"), true);
});

test("a write run fills an empty directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-"));
  const result = runCli(["--input", examplePath, "--out", dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(walk(dir), [...scaffoldFiles(example).keys()].sort());
});

test("a non-empty target is refused without --force", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-"));
  mkdirSync(join(dir, "templates"), { recursive: true });
  writeFileSync(join(dir, "templates", "index.html"), "hand written, do not lose me");

  const result = runCli(["--input", examplePath, "--out", dir]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not empty/i);
  assert.equal(
    readFileSync(join(dir, "templates", "index.html"), "utf8"),
    "hand written, do not lose me"
  );
});

test("--force overwrites a non-empty target", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-"));
  writeFileSync(join(dir, "style.css"), "stale");

  assert.equal(runCli(["--input", examplePath, "--out", dir, "--force"]).status, 0);
  assert.match(readFileSync(join(dir, "style.css"), "utf8"), /Theme Name: Agency Site/);
});

test("--force keeps the authored seed files and rewrites the owned ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-"));
  assert.equal(runCli(["--input", examplePath, "--out", dir]).status, 0);

  writeFileSync(join(dir, "templates", "front-page.html"), "authored front page");
  writeFileSync(join(dir, "CLAUDE.md"), "authored lessons");
  writeFileSync(join(dir, "style.css"), "stale");

  const result = runCli(["--input", examplePath, "--out", dir, "--force"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /kept templates\/front-page\.html \(authored content\)/);
  assert.match(result.stdout, /kept CLAUDE\.md \(authored content\)/);
  assert.equal(readFileSync(join(dir, "templates", "front-page.html"), "utf8"), "authored front page");
  assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf8"), "authored lessons");
  assert.match(readFileSync(join(dir, "style.css"), "utf8"), /Theme Name: Agency Site/);
});

test("a fresh scaffold still writes the seed files, with the real paths threaded in", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-"));
  const out = join(dir, "theme");
  assert.equal(runCli(["--input", examplePath, "--out", out]).status, 0);

  assert.match(readFileSync(join(out, "templates", "front-page.html"), "utf8"), /wp:template-part/);
  const claude = readFileSync(join(out, "CLAUDE.md"), "utf8");
  assert.equal(claude.includes(`--input "${examplePath}"`), true, "regen command lacks the input path");
  assert.equal(claude.includes(`--out "${out}/theme.json"`), true, "regen command lacks the output path");
});

test("the footer degrades when the design system lacks dark and small", () => {
  const doc = structuredClone(example);
  doc.palette = doc.palette.filter((entry) => entry.slug !== "dark");
  doc.typography.fontSizes = doc.typography.fontSizes.filter((entry) => entry.slug !== "small");
  doc.elements.button.hover.background = "primary";
  doc.elements.link.hover.text = "primary";

  // No dangling refs for validate-blocks to find: the omitted slugs are absent
  // from the markup entirely, attributes and classes both.
  const footer = scaffoldFiles(doc).get("parts/footer.html");
  assert.equal(footer.includes("dark"), false, "the dark slug dangles");
  assert.equal(footer.includes("small"), false, "the small slug dangles");
  assert.equal(footer.includes("backgroundColor"), false);
  assert.equal(footer.includes("has-background"), false);
  assert.equal(footer.includes("fontSize"), false);
  assert.match(footer, /"textColor":"surface"/);
  assert.match(footer, /has-surface-color has-text-color/);

  const dir = mkdtempSync(join(tmpdir(), "gbs-"));
  const input = join(dir, "design-system.json");
  writeFileSync(input, JSON.stringify(doc));
  const result = runCli(["--input", input, "--out", join(dir, "theme")]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /warning: palette has no "dark", the footer part omits its background/);
  assert.match(result.stderr, /warning: font sizes have no "small", the footer part omits its font size/);
  assert.match(result.stderr, /warning: palette is missing the semantic slug "dark"/);
});
