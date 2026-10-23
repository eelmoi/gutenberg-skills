import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildThemeJson, serialize, wpKebab } from "../tools/build-theme-json.mjs";

const examplePath = fileURLToPath(
  new URL("../examples/agency-site/input/design-system.json", import.meta.url)
);
const expectedPath = fileURLToPath(
  new URL("../examples/agency-site/expected/theme/theme.json", import.meta.url)
);
const cliPath = fileURLToPath(new URL("../tools/build-theme-json.mjs", import.meta.url));

const example = JSON.parse(readFileSync(examplePath));

function withChange(mutate) {
  const doc = structuredClone(example);
  mutate(doc);
  return doc;
}

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

test("the committed example theme.json is exactly what the generator produces", () => {
  const generated = serialize(buildThemeJson(example));
  const onDisk = readFileSync(expectedPath, "utf8").replace(/\r\n/g, "\n");
  assert.equal(generated, onDisk);
});

test("output is deterministic across runs", () => {
  assert.equal(serialize(buildThemeJson(example)), serialize(buildThemeJson(example)));
});

test("the schema url and version follow meta.wpVersion", () => {
  const theme = buildThemeJson(example);
  assert.equal(theme.$schema, "https://schemas.wp.org/wp/7.0/theme.json");
  assert.equal(theme.version, 3);
});

test("the two scaffolded parts are declared with their areas", () => {
  // Verified on WordPress 7.1: without this declaration get_block_templates()
  // reports both parts as area "uncategorized", and the site editor files them
  // outside Header and Footer. The pages render either way, so nothing else
  // in the suite would notice this going missing.
  const parts = buildThemeJson(example).templateParts;
  assert.deepEqual(parts, [
    { name: "header", title: "Header", area: "header" },
    { name: "footer", title: "Footer", area: "footer" }
  ]);
});

test("every palette colour reaches settings.color.palette", () => {
  const theme = buildThemeJson(example);
  assert.deepEqual(
    theme.settings.color.palette.map((c) => c.slug),
    example.palette.map((c) => c.slug)
  );
  assert.equal(theme.settings.color.custom, false);
  assert.equal(theme.settings.color.defaultPalette, false);
});

test("button colours become preset references, never hex", () => {
  const theme = buildThemeJson(example);
  const button = theme.styles.elements.button;
  assert.equal(button.color.background, "var:preset|color|primary");
  assert.equal(button.color.text, "var:preset|color|surface");
  assert.equal(serialize(theme).includes("#1f5f4b"), true, "palette keeps its hex");
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(serialize(theme.styles)), false, "styles carry none");
});

test("button hover lands under the :hover pseudo selector", () => {
  const hover = buildThemeJson(example).styles.elements.button[":hover"];
  assert.equal(hover.color.background, "var:preset|color|dark");
  assert.equal(hover.color.text, "var:preset|color|surface");
});

test("the card style becomes custom properties, not a block override", () => {
  const theme = buildThemeJson(example);
  assert.equal(theme.settings.custom.card.radius, "8px");
  assert.equal(
    theme.settings.custom.card.background,
    "var(--wp--preset--color--surface)"
  );
  // A card is a Pattern of core blocks, so styling core/group globally would
  // hit every Group on the site. Custom properties let the pattern opt in.
  assert.equal(theme.styles.blocks, undefined);
});

test("section rhythm resolves spacing slugs to preset variables", () => {
  const rhythm = buildThemeJson(example).settings.custom.sectionRhythm;
  assert.equal(rhythm.default, "var(--wp--preset--spacing--50)");
  assert.equal(rhythm.loose, "var(--wp--preset--spacing--60)");
});

test("heading line-height references kebab-case digits the way WordPress does", () => {
  // WordPress runs settings.custom keys through _wp_to_kebab_case, which
  // splits letter-digit boundaries, so the property for the "h1" key is
  // --wp--custom--line-height--h-1. A reference built from the raw slug
  // dangles and every heading falls back to inherited line height.
  const theme = buildThemeJson(example);
  assert.equal(
    theme.styles.elements.h1.typography.lineHeight,
    "var(--wp--custom--line-height--h-1)"
  );
  assert.equal(
    theme.styles.typography.lineHeight,
    "var(--wp--custom--line-height--body)"
  );
  // The keys themselves stay raw, WordPress kebab-cases those on its own.
  assert.equal(theme.settings.custom.lineHeight.h1, "1.15");
});

test("heading font-size references kebab-case digits the way WordPress does", () => {
  // WordPress declares the "h2" preset as --wp--preset--font-size--h-2 but
  // expands var:preset|font-size|h2 to --wp--preset--font-size--h2 without
  // kebab-casing, so a reference built from the raw slug dangles and every
  // heading renders at the body size. Verified on WordPress 7.1.
  const theme = buildThemeJson(example);
  assert.equal(theme.styles.elements.h1.typography.fontSize, "var:preset|font-size|h-1");
  assert.equal(theme.styles.elements.h2.typography.fontSize, "var:preset|font-size|h-2");
  assert.equal(theme.styles.elements.h3.typography.fontSize, "var:preset|font-size|h-3");
  // Slugs without a letter-digit boundary are untouched.
  assert.equal(theme.styles.typography.fontSize, "var:preset|font-size|body");
  // The preset definitions keep the raw slug, WordPress kebab-cases those itself.
  assert.ok(theme.settings.typography.fontSizes.some((size) => size.slug === "h2"));
});

test("a fontFace fontStretch range reaches theme.json unchanged", () => {
  const doc = withChange((d) => {
    d.typography.fontFamilies[1].fontFace = [
      {
        fontFamily: "Archivo",
        fontWeight: "400 900",
        fontStyle: "normal",
        fontStretch: "62% 125%",
        src: ["file:./assets/fonts/archivo-latin.woff2"]
      }
    ];
  });
  const families = buildThemeJson(doc).settings.typography.fontFamilies;
  assert.equal(families[1].fontFace[0].fontStretch, "62% 125%");
});

test("numeric spacing slugs pass through the kebab transform unchanged", () => {
  const theme = buildThemeJson(example);
  assert.equal(theme.styles.spacing.blockGap, "var:preset|spacing|40");
});

test("the kebab transform matches WordPress on the slugs the schema allows", () => {
  // Each expected value is what WordPress's own _wp_to_kebab_case returns. An
  // ordinal ending a word stays whole: white2nd and white4th come from its
  // unit tests.
  const cases = [
    ["h1", "h-1"],
    ["h10", "h-10"],
    ["50", "50"],
    ["x-large", "x-large"],
    ["accent2", "accent-2"],
    ["s1", "s-1"],
    ["2xl", "2-xl"],
    ["white2nd", "white-2nd"],
    ["white4th", "white-4th"],
    ["accent-2nd", "accent-2nd"],
    ["level-11th", "level-11-th"],
    ["brand--dark", "brand-dark"],
    ["primary-", "primary"],
    [40, "40"]
  ];
  for (const [slug, expected] of cases) assert.equal(wpKebab(slug), expected, String(slug));
});

test("custom properties name a preset the same way the styles do", () => {
  // settings.custom values are CSS that WordPress emits as written, so a raw
  // "neutral2" there would point at --wp--preset--color--neutral2, which
  // WordPress never declares: the card would lose its background and every
  // section its rhythm padding.
  const doc = withChange((d) => {
    d.palette.push({ slug: "neutral2", name: "Neutral 2", color: "#e8e8e3" });
    d.spacing.spacingSizes.push({ slug: "s5", name: "S5", size: "64px" });
    d.styles.card.background = "neutral2";
    d.styles.sectionRhythm.default = "s5";
    d.elements.button.hover.background = "neutral2";
  });
  const theme = buildThemeJson(doc);
  assert.equal(theme.settings.custom.card.background, "var(--wp--preset--color--neutral-2)");
  assert.equal(theme.settings.custom.sectionRhythm.default, "var(--wp--preset--spacing--s-5)");
  assert.equal(
    theme.styles.elements.button[":hover"].color.background,
    "var:preset|color|neutral-2"
  );
});

test("one fluid size turns the global flag on and flags every preset", () => {
  // Only "display" opts in. WordPress fluidizes every preset unless it
  // carries an explicit fluid: false, so the non-fluid sizes need one.
  const theme = buildThemeJson(example);
  assert.equal(theme.settings.typography.fluid, true);
  for (const size of theme.settings.typography.fontSizes) {
    assert.equal(size.fluid, size.slug === "display", size.slug);
  }
});

test("a design with no fluid sizes carries no fluid flags at all", () => {
  const theme = buildThemeJson(
    withChange((d) => {
      for (const size of d.typography.fontSizes) delete size.fluid;
    })
  );
  assert.equal("fluid" in theme.settings.typography, false);
  for (const size of theme.settings.typography.fontSizes) {
    assert.equal("fluid" in size, false, size.slug);
  }
});

test("version 3 default presets are suppressed explicitly", () => {
  // theme.json version 3 no longer hides the WordPress default presets just
  // because the theme declares its own, each list needs its own flag.
  const settings = buildThemeJson(example).settings;
  assert.equal(settings.typography.defaultFontSizes, false);
  assert.equal(settings.spacing.defaultSpacingSizes, false);
});

test("layout.rootPadding emits the padding and the awareness flag together", () => {
  const theme = buildThemeJson(withChange((d) => (d.layout.rootPadding = "24px")));
  assert.equal(theme.settings.useRootPaddingAwareAlignments, true);
  assert.deepEqual(theme.styles.spacing.padding, { left: "24px", right: "24px" });
});

test("without rootPadding neither the padding nor the flag appears", () => {
  // The flag alone makes .has-global-padding reference undeclared
  // --wp--style--root--padding-* variables and gutters collapse to zero.
  const theme = buildThemeJson(withChange((d) => delete d.layout.rootPadding));
  assert.equal("useRootPaddingAwareAlignments" in theme.settings, false);
  assert.equal("padding" in theme.styles.spacing, false);
});

test("an absent optional element produces no empty branch", () => {
  const theme = buildThemeJson(withChange((d) => delete d.elements.link));
  assert.equal("link" in theme.styles.elements, false);
});

test("the generator refuses a design system with a dangling reference", () => {
  assert.throws(
    () => buildThemeJson(withChange((d) => (d.elements.button.background = "primayr"))),
    /elements\.button\.background/
  );
});

test("--check passes when the file on disk matches", () => {
  const result = runCli(["--input", examplePath, "--out", expectedPath, "--check"]);
  assert.equal(result.status, 0, result.stderr);
});

test("--check fails when the file on disk has been hand edited", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-"));
  const target = join(dir, "theme.json");
  const tampered = buildThemeJson(example);
  tampered.settings.layout.wideSize = "1400px";
  writeFileSync(target, serialize(tampered));

  const result = runCli(["--input", examplePath, "--out", target, "--check"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /differs/i);
});

test("a write run produces a file that then passes --check", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-"));
  const target = join(dir, "theme.json");

  assert.equal(runCli(["--input", examplePath, "--out", target]).status, 0);
  assert.equal(runCli(["--input", examplePath, "--out", target, "--check"]).status, 0);
});
