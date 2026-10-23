# WebAula Gutenberg Skills

Three Claude skills and the tooling that turns an approved design into a working
WordPress block theme built from native Gutenberg blocks.

The short version: `design-migration` runs the pipeline, `native-blocks` decides
what to build, `block-authoring` writes markup that actually validates.

## The pipeline

```
design + design system
  |
  1 audit          model      -> buildability-report.md
  2 extract        model      -> design-system.json
  3 scaffold       script     -> theme/ + theme.json
  4 map sections   model      -> section-map.md
  5 author markup  model      -> templates/, parts/, patterns/
  6 validate       script     -> pass, or a list of failures
```

Stages 3 and 6 are scripts because their inputs have a fixed shape. The rest is
judgement, but every stage lands in a named file, which is what makes the work
reviewable instead of one opaque prompt.

**Stage 1 is a hard gate.** No markup is authored until every blocker is either
flattened in the design or accepted with a written cost. It is the cheapest step
and the easiest to skip, and skipping it moves the discovery of an unbuildable
design from minute one to halfway through the build.

## Quickstart

```sh
git clone https://github.com/rejver007/gutenberg-skills.git
cd gutenberg-skills
npm install
npm test
```

Then run the worked example end to end:

```sh
node tools/scaffold-theme.mjs --input examples/agency-site/input/design-system.json --out /tmp/agency-theme
node tools/validate-blocks.mjs --theme examples/agency-site/expected/theme --report examples/agency-site/input/buildability-report.md
```

`examples/agency-site/` carries the whole path: a Claude Design output, its
buildability report, the design system, the section map, and the finished theme.
`examples/legacy-redesign/` carries a design that fails stage 1, and stops there.

## The skills

| Skill | Job | Source |
|---|---|---|
| `gutenberg-design-migration` | The six stages, the gate, and the commands. Sequences the other two rather than repeating them | Internal (WebAula) |
| `gutenberg-native-blocks` | Project workflow: design briefs with the Gutenberg constraint, section-to-block mapping, theme.json design systems, patterns strategy, WebAula house rules | Internal (WebAula) |
| `gutenberg-block-authoring` | Generating valid serialized block markup that never triggers "Attempt Block Recovery". Per-block attribute schemas, class order, style property order, validated against WordPress 7.0 Gutenberg source | [ross-mulcahy/gutenberg-block-authoring-skill](https://github.com/ross-mulcahy/gutenberg-block-authoring-skill), MIT, vendored snapshot |

### gutenberg-design-migration

Sequences the pipeline above. Its most useful content is not the list of steps
but the stage 1 gate and the flattening table: what an overlapping hero card, a
corner badge, a diagonal mask and a `:has()` selected state each turn into when
they have to be built from core blocks.

Triggers on converting a design to a theme, migrating a Claude design, building
a design in WordPress, scaffolding a block theme, and anything involving
design-system.json or theme.json generation.

### gutenberg-native-blocks

Field-tested practices from real WebAula agency projects. The core lesson:
decide at the design stage that the site is built in Gutenberg, and make every
design decision map to a core block. Sites fail when the design is drawn first
and blocks are forced onto it afterwards.

It covers constraint-first design briefs, the section-to-block vocabulary,
theme.json as the single source of truth, what consistently works (accent colour
restraint, registering Patterns for anything repeated, the master template
method, mastering Group, Columns, Cover and Query Loop first) and what
consistently fails (absolute positioning, heavy custom CSS over blocks, `:has()`
state styling, automatic word-break on Finnish compounds).

### gutenberg-block-authoring

Serialized markup that pastes into the block editor without triggering
validation errors. The full serialization grammar, 50+ core blocks with
attribute schemas and working examples, colour and typography and spacing
patterns, ready content patterns, template patterns, WordPress 7.0 features, and
`block-reference.json` with machine-readable schemas extracted from the
Gutenberg `wp/7.0` source.

## The tools

All Node, ESM, no build step. Node 20 or newer.

| Tool | What it does |
|---|---|
| `tools/build-theme-json.mjs` | `design-system.json` to `theme.json`, deterministically. `--check` fails when the file on disk is not what the design system generates, which catches hand edits |
| `tools/scaffold-theme.mjs` | The 15 file theme structure, seeded from the design system, including a `CLAUDE.md` carrying the real preset slugs. `--force` rewrites the owned files but keeps `templates/front-page.html` and `CLAUDE.md`, which are seeded once and then authored |
| `tools/validate-blocks.mjs` | The vendored WordPress parser plus five house rules. `--theme` walks a whole theme, `--file` checks a single file (alone, or with `--theme` to resolve preset slugs), `--json` emits findings a model can act on |
| `tools/lint-design-system.mjs` | The cross references JSON Schema cannot express, such as a button colour pointing at a palette slug that does not exist. Also a CLI: `node tools/lint-design-system.mjs design-system.json` exits 1 on errors |
| `tools/auto-update.mjs` | The session-start check that keeps a global install on GitHub's `main` (see Install for Claude Code). `--register` and `--unregister` add and remove its hook in `~/.claude/settings.json`; `./install.sh` calls them |
| `schemas/design-system.schema.json` | The contract. Rejects raw hex anywhere a preset slug belongs |

### House rules with a machine check

| Rule | Level | Fails on |
|---|---|---|
| `no-raw-hex` | error | a hex value in block attributes or an inline style |
| `preset-slugs-exist` | error | a preset slug theme.json does not define |
| `no-absolute-position` | error | `position: absolute` or `fixed` |
| `no-dashes` | error | an em dash or en dash anywhere in the markup, attributes and delimiters included |
| `soft-hyphen-hint` | warn | a long Finnish or Swedish compound in a heading or button with no `&shy;` |

Each has an id that `--skip-rule` accepts, so a project can disable one without
forking the tool. The missing buildability report warning is skippable the same
way, as `--skip-rule buildability-report`.

## Install for Claude Code

Global (all projects on your machine), and kept up to date:

```sh
./install.sh
```

This copies the skills into `~/.claude/skills` and turns on automatic updates.
At the start of every Claude Code session a hook checks `main` on GitHub. When
it has moved, the hook fast-forwards your clone, copies the skills again and
says so in one line. When nothing is new it says nothing.

The hook only ever fast-forwards. A clone with uncommitted changes, another
branch checked out, or commits of its own is left alone, and the hook says why.
Offline, it tries again at the next session. It needs Node 20 or newer, which
the tools need anyway. It runs from where the clone is, so after moving the
clone, run `./install.sh` again from the new place.

To install without automatic updates, or to turn them off later:

```sh
./install.sh --no-auto-update
```

`GUTENBERG_SKILLS_NO_UPDATE=1` in the environment skips the check without
touching your settings.

Project-scoped (commit skills into one client repo):

```sh
./install.sh --project
```

Both discover skills from the `skills/` directory, so adding one needs no edit.
`./install.sh --list` prints what would be installed.

You can also skip this repo entirely for a client project and commit the
`skills/` folders directly into that project's `.claude/skills/`. Everyone who
clones the project gets them automatically.

## Install for claude.ai (chat)

Grab the packaged files from `dist/` and save them in Claude:

- `dist/gutenberg-design-migration.skill`
- `dist/gutenberg-native-blocks.skill`
- `dist/gutenberg-block-authoring.skill`

Open the file in a Claude chat and click Save skill, or upload it under
Settings > Capabilities > Skills.

If WebAula is on a Team or Enterprise plan, the better path is org provisioning:
an owner uploads these files once under Organization settings > Skills and
everyone gets them automatically, including future updates.

## Updating the skills

1. Edit the SKILL.md under `skills/<name>/`.
2. Regenerate the dist packages: `./make-dist.sh`
3. Commit and push. Merged to `main`, a change reaches every global install at
   its next Claude Code session, with nothing to run by hand. Project-scoped
   installs still update on `git pull` and `./install.sh --project`. claude.ai
   users re-save the new `.skill` file, or the org admin re-uploads it.

CI fails if `dist/` is out of date with `skills/`.

## Vendored code

The repo vendors from the same upstream in two places, pinned independently:

| Path | Upstream file | Pinned to |
|---|---|---|
| `skills/gutenberg-block-authoring/` | `gutenberg-content/` | commit `62c8a6c8`, plus local patches |
| `tools/vendor/validate-blocks.cjs` | `validate-blocks.js` | commit `62c8a6c8` |

Details, the three mechanical modifications to the validator, the local patches
to the skill, and how to enable the validator's optional per-attribute type
checks are in `tools/UPSTREAM.md`.

License for both: MIT, Copyright (c) 2026 Ross Mulcahy. The licence text is
included at `skills/gutenberg-block-authoring/LICENSE` and
`tools/vendor/LICENSE`. Keep it there when copying either anywhere else.

If a future WordPress version starts triggering block recovery, check upstream
for an updated release before debugging by hand.

## What none of this proves

That a generated theme activates. The validator checks serialization, not
WordPress. Activating the theme in a real WordPress 7.0 install and opening each
page in the editor is a manual step, and it is the last one before a client sees
anything.
