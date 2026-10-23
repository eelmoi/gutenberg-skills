# Vendored code

## tools/vendor/validate-blocks.cjs

Source: https://github.com/ross-mulcahy/gutenberg-block-authoring-skill
Commit: `62c8a6c8dfecc088495feccaae184e7253da789c` (2026-06-09, "Update skill for WordPress 7.0")
File: `validate-blocks.js`
License: MIT, Copyright (c) 2026 Ross Mulcahy. Full text in `tools/vendor/LICENSE`.

This is the validator the README used to point at without shipping. It parses
markup with `@wordpress/block-serialization-default-parser`, the same parser
WordPress core uses, and reports delimiter mismatches, invalid attribute JSON,
style attributes that do not exist in Gutenberg, and missing required classes.

### Modifications

Three, all mechanical:

1. **Renamed `.js` to `.cjs`.** This repo is `"type": "module"`, and the
   upstream file is CommonJS. The extension is the whole fix, the contents are
   untouched by the rename.

2. **A guard and an export, at the "Main" section.** Upstream dispatches on
   `process.argv` at load time, so requiring it would run the CLI and block on
   stdin. The patch adds `module.exports = { validateMarkup, loadBlockSchemas }`
   and turns the first `if` into `if (require.main !== module) { } else if`.
   Executed directly, behaviour is identical. The patch is marked in the file
   with a `VENDOR PATCH` comment.

3. **Lazy, memoized schema loading.** Upstream calls `loadBlockSchemas()` at
   require time, keyed on `GUTENBERG_DIR`, so two machines could silently run
   different checks with nothing in the output saying so. The load now happens
   on the first `validateMarkup` call and is cached, and every
   `loadBlockSchemas()` call returns the same boolean, which says whether the
   per-attribute type checks are active. The wrapper surfaces it as a
   `block schemas:` line in the human report and a `hasSchemas` field in the
   `--json` payload. This patch is also marked with a `VENDOR PATCH` comment.

House rules are **not** patched into this file. They live in
`tools/validate-blocks.mjs`, which calls the upstream checks and adds its own.
Keeping the two apart is what makes the next upstream update a copy rather than
a merge.

### Attribute type checks are off by default

`loadBlockSchemas()` reads `block.json` files from a Gutenberg checkout at
`$GUTENBERG_DIR` (default `/tmp/gutenberg`). Without that checkout the
structural checks all still run, only the per-attribute type checks are
skipped. To enable them:

```sh
git clone --depth 1 --branch wp/7.0 https://github.com/WordPress/gutenberg /tmp/gutenberg
GUTENBERG_DIR=/tmp/gutenberg node tools/validate-blocks.mjs --theme theme/
```

### Updating

The repo vendors from this same upstream in two places, and they are pinned
independently:

| Path | Upstream file | Pinned to |
|---|---|---|
| `skills/gutenberg-block-authoring/` | `gutenberg-content/` | `62c8a6c8`, plus the local patches below |
| `tools/vendor/validate-blocks.cjs` | `validate-blocks.js` | `62c8a6c8` |

Check them together. If a future WordPress release starts triggering block
recovery, take an updated upstream release before debugging by hand.

## skills/gutenberg-block-authoring/

Source: the same upstream, folder `gutenberg-content/`, at `62c8a6c8`.

### Local patches

`SKILL.md` was byte-identical to upstream until these. Each one corrects markup
the skill taught that WordPress 7.0 sends to block recovery or silently
rewrites, checked in the 7.0 editor. They are worth offering upstream. Until
upstream has them, re-apply them after every refresh, because a refresh is a
copy:

1. **Rule 6, attributes with no source.** The parser reads them only from the
   comment JSON, but save() may still render them, and then the HTML must
   match.
2. **Rule 7 and the button class table.** Preset classes use the kebab-cased
   slug: `h2` gives `has-h-2-font-size`.
3. **`wp:cover` `alt`.** It has had no HTML source since WordPress 6.5, so it
   goes in the comment JSON and on the `<img>`, or on the background `<div>`
   as `aria-label` for a parallax or repeated cover. The attribute table, the
   main example and a gotcha say so.
4. **`wp:cover` overlay classes.** A `dimRatio` of 50 gets `has-background-dim`
   alone, other values round to the nearest 10, and
   `wp-block-cover__gradient-background` is left out at 0. The main example
   no longer carries `has-background-dim-50`.
5. **`wp:cover` `focalPoint`.** A gotcha gives its `object-position` output.
