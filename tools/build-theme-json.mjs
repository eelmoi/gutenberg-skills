#!/usr/bin/env node
/**
 * design-system.json  ->  theme.json
 *
 *   node tools/build-theme-json.mjs --input design-system.json --out theme/theme.json
 *   node tools/build-theme-json.mjs --input design-system.json --out theme/theme.json --check
 *
 * Deterministic. The same input always produces the same bytes, which is what
 * makes --check meaningful: it exits 1 when theme.json on disk is not what the
 * design system says it should be, that is, when somebody hand edited the
 * generated file. Hand edits are the failure this tool exists to prevent,
 * because they put the design system and the theme out of sync with no signal.
 *
 * No runtime dependencies. This file gets copied into client theme repos, so it
 * must run on a bare Node install. Schema validation needs ajv and therefore
 * lives in the test suite, not here. What does run here is the referential
 * lint, because a dangling slug produces a silently broken theme.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { lintDesignSystem } from "./lint-design-system.mjs";

// WordPress expands "var:preset|font-size|h2" by joining the parts with "--",
// without touching the slug, so it becomes var(--wp--preset--font-size--h2).
// The preset itself is declared under _wp_to_kebab_case(slug), which is
// --wp--preset--font-size--h-2. A raw slug with a letter-digit boundary
// therefore dangles: every h1-h3 element style fell back to the body size
// (seen on WordPress 7.1). Kebab-casing here makes both names agree, and is a
// no-op for slugs that are already kebab case or purely numeric ("50").
const PRESET_VAR = {
  color: (slug) => `var:preset|color|${wpKebab(slug)}`,
  fontFamily: (slug) => `var:preset|font-family|${wpKebab(slug)}`,
  fontSize: (slug) => `var:preset|font-size|${wpKebab(slug)}`,
  spacing: (slug) => `var:preset|spacing|${wpKebab(slug)}`
};

// WordPress runs settings.custom keys through _wp_to_kebab_case before naming
// the custom property, and that transform splits letter-digit boundaries, so
// the key "h1" becomes --wp--custom--line-height--h-1. References built here
// must apply the same transform or they dangle. The keys themselves are
// emitted untransformed, WordPress kebab-cases those on its own.
function wpKebab(slug) {
  return slug
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .replace(/([0-9])([a-zA-Z])/g, "$1-$2")
    .toLowerCase();
}

// settings.custom values are emitted as plain CSS, so they use the resolved
// custom property rather than the var:preset| shorthand, which WordPress only
// expands inside styles.
const CSS_VAR = {
  color: (slug) => `var(--wp--preset--color--${slug})`,
  spacing: (slug) => `var(--wp--preset--spacing--${slug})`,
  lineHeight: (slug) => `var(--wp--custom--line-height--${wpKebab(slug)})`
};

const HEADING_LEVELS = ["h1", "h2", "h3"];

function has(list, slug) {
  return (list ?? []).some((entry) => entry.slug === slug);
}

/**
 * @param {object} doc a design-system.json document
 * @returns {object} a WordPress theme.json version 3 document
 */
export function buildThemeJson(doc) {
  const { errors } = lintDesignSystem(doc);
  if (errors.length > 0) {
    throw new Error(
      `design-system.json fails the design system lint:\n  ${errors.join("\n  ")}`
    );
  }

  const fontSizes = doc.typography.fontSizes;
  const families = doc.typography.fontFamilies;

  // Line heights have no home in settings.typography.fontSizes, so they are
  // exposed once as custom properties and referenced from styles. One source,
  // and nothing from the design system is silently dropped.
  const lineHeight = {};
  for (const size of fontSizes) {
    if (size.lineHeight !== undefined) lineHeight[size.slug] = size.lineHeight;
  }

  // Once one size opts in, the global flag turns on and every preset carries
  // its own fluid key, because WordPress only skips fluidizing a preset on an
  // explicit false. With no opt-ins both the global flag and the per-size
  // keys are omitted.
  const fluid = fontSizes.some((size) => size.fluid === true);

  const typography = { customFontSize: false };
  if (fluid) typography.fluid = true;
  typography.defaultFontSizes = false;
  typography.fontFamilies = families.map((family) => {
    const out = {
      slug: family.slug,
      name: family.name,
      fontFamily: family.fontFamily
    };
    if (family.fontFace) out.fontFace = family.fontFace;
    return out;
  });
  typography.fontSizes = fontSizes.map((size) => {
    const out = {
      slug: size.slug,
      name: size.name,
      size: size.size
    };
    if (fluid) out.fluid = size.fluid === true;
    return out;
  });

  const settings = { appearanceTools: true };
  // The flag makes .has-global-padding reference --wp--style--root--padding-*,
  // which only exist when styles.spacing.padding is set. Without a declared
  // root padding the flag would collapse every gutter to zero, so the two are
  // emitted together or not at all.
  if (doc.layout.rootPadding !== undefined) {
    settings.useRootPaddingAwareAlignments = true;
  }
  Object.assign(settings, {
    layout: {
      contentSize: doc.layout.contentSize,
      wideSize: doc.layout.wideSize
    },
    color: {
      // The design system is the palette. Turning the defaults off is what
      // stops an editor from reaching for a colour that is not in it.
      custom: false,
      customDuotone: false,
      customGradient: false,
      defaultDuotone: false,
      defaultGradients: false,
      defaultPalette: false,
      palette: doc.palette.map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        color: entry.color
      }))
    },
    typography,
    spacing: {
      customSpacingSize: false,
      defaultSpacingSizes: false,
      units: ["px", "rem", "%", "vw"],
      spacingSizes: doc.spacing.spacingSizes.map((step) => ({
        slug: step.slug,
        name: step.name,
        size: step.size
      }))
    },
    custom: buildCustom(doc, lineHeight)
  });

  return {
    $schema: `https://schemas.wp.org/wp/${doc.meta.wpVersion}/theme.json`,
    version: 3,
    settings,
    styles: buildStyles(doc, { fontSizes, families, lineHeight }),
    // scaffold-theme.mjs always writes these two parts, so theme.json always
    // declares them. Without the declaration WordPress resolves both to
    // area "uncategorized": the pages render, but the site editor files them
    // outside Header and Footer, which is not where anyone looks for them.
    templateParts: [
      { name: "header", title: "Header", area: "header" },
      { name: "footer", title: "Footer", area: "footer" }
    ]
  };
}

function buildCustom(doc, lineHeight) {
  const card = {
    background: CSS_VAR.color(doc.styles.card.background),
    radius: doc.styles.card.radius,
    padding: { ...doc.styles.card.padding }
  };
  if (doc.styles.card.shadow) card.shadow = doc.styles.card.shadow;
  if (doc.styles.card.borderColor) {
    card.borderColor = CSS_VAR.color(doc.styles.card.borderColor);
  }

  const custom = { card };
  if (Object.keys(lineHeight).length > 0) custom.lineHeight = lineHeight;
  custom.sectionRhythm = {
    default: CSS_VAR.spacing(doc.styles.sectionRhythm.default),
    tight: CSS_VAR.spacing(doc.styles.sectionRhythm.tight),
    loose: CSS_VAR.spacing(doc.styles.sectionRhythm.loose)
  };
  return custom;
}

function buildStyles(doc, { fontSizes, families, lineHeight }) {
  const bodyFamily = has(families, "body") ? "body" : families[0].slug;

  const rootTypography = { fontFamily: PRESET_VAR.fontFamily(bodyFamily) };
  if (has(fontSizes, "body")) rootTypography.fontSize = PRESET_VAR.fontSize("body");
  if (lineHeight.body) rootTypography.lineHeight = CSS_VAR.lineHeight("body");

  const elements = {};

  if (has(families, "heading")) {
    elements.heading = {
      typography: { fontFamily: PRESET_VAR.fontFamily("heading") }
    };
  }

  for (const level of HEADING_LEVELS) {
    if (!has(fontSizes, level)) continue;
    const typography = { fontSize: PRESET_VAR.fontSize(level) };
    if (lineHeight[level]) typography.lineHeight = CSS_VAR.lineHeight(level);
    elements[level] = { typography };
  }

  elements.button = buildButton(doc.elements.button);
  if (doc.elements.link) elements.link = buildLink(doc.elements.link);

  // Body text prefers an "ink" palette slug over "text": a palette entry with
  // slug "text" makes WordPress emit `.has-text-color { color: ... !important }`,
  // which collides with core's has-text-color marker class and overrides every
  // named text colour on the page.
  const inkSlug = doc.palette.some((c) => c.slug === "ink") ? "ink" : "text";

  const spacing = {
    blockGap: PRESET_VAR.spacing(doc.styles.sectionRhythm.tight)
  };
  if (doc.layout.rootPadding !== undefined) {
    // Only left and right. Vertical rhythm is sectionRhythm's job, and a root
    // top padding would push the header off the top of the viewport.
    spacing.padding = {
      left: doc.layout.rootPadding,
      right: doc.layout.rootPadding
    };
  }

  return {
    color: {
      background: PRESET_VAR.color("surface"),
      text: PRESET_VAR.color(inkSlug)
    },
    typography: rootTypography,
    spacing,
    elements
  };
}

function buildButton(button) {
  const out = {
    border: { radius: button.radius },
    color: {
      background: PRESET_VAR.color(button.background),
      text: PRESET_VAR.color(button.text)
    },
    spacing: { padding: { ...button.padding } }
  };
  if (button.fontSize) {
    out.typography = { fontSize: PRESET_VAR.fontSize(button.fontSize) };
  }
  out[":hover"] = {
    color: {
      background: PRESET_VAR.color(button.hover.background),
      text: PRESET_VAR.color(button.hover.text)
    }
  };
  return out;
}

function buildLink(link) {
  const out = { color: { text: PRESET_VAR.color(link.text) } };
  if (link.textDecoration) {
    out.typography = { textDecoration: link.textDecoration };
  }
  if (link.hover) {
    const hover = { color: { text: PRESET_VAR.color(link.hover.text) } };
    if (link.hover.textDecoration) {
      hover.typography = { textDecoration: link.hover.textDecoration };
    }
    out[":hover"] = hover;
  }
  return out;
}

/**
 * Always LF, always a trailing newline. JSON.stringify cannot emit CRLF, so
 * nothing needs normalising here. The read side of --check is what normalises
 * line endings, because git converts to CRLF on checkout on Windows and a
 * fresh clone would otherwise fail --check on an untouched file.
 */
export function serialize(theme) {
  return JSON.stringify(theme, null, 2) + "\n";
}

function parseArgs(argv) {
  const args = { check: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--check") args.check = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!args.input || !args.out) {
    throw new Error("usage: build-theme-json.mjs --input <file> --out <file> [--check]");
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const doc = JSON.parse(readFileSync(args.input, "utf8"));

  for (const warning of lintDesignSystem(doc).warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }

  const generated = serialize(buildThemeJson(doc));

  if (!args.check) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, generated);
    process.stdout.write(`wrote ${args.out}\n`);
    return 0;
  }

  let onDisk;
  try {
    onDisk = readFileSync(args.out, "utf8").replace(/\r\n/g, "\n");
  } catch {
    process.stderr.write(`${args.out} is missing, run without --check to generate it\n`);
    return 1;
  }

  if (onDisk !== generated) {
    process.stderr.write(
      `${args.out} differs from what design-system.json generates.\n` +
        `Fix the design system and regenerate, do not edit theme.json by hand.\n`
    );
    return 1;
  }

  process.stdout.write(`${args.out} is up to date\n`);
  return 0;
}

// pathToFileURL, not string interpolation: a Windows path produces
// file:///D:/... with three slashes, so the naive comparison is always false
// and the CLI silently does nothing while exiting 0.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    // exitCode, not exit(): exit() can truncate stdout still buffered in a
    // POSIX pipe, and there is nothing here that needs to die early.
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
