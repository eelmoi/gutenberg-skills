# Agency Site

Conventions for this theme. Append every hard won lesson so the next session
starts smarter.

## Generated files, do not hand edit

`theme.json` is generated from `design-system.json`. Change the design system
and regenerate:

```sh
node tools/build-theme-json.mjs --input "examples/agency-site/input/design-system.json" --out "examples/agency-site/expected/theme/theme.json" --check
```

`--check` fails if the two have drifted apart.

## Colour presets

| Slug | Name | Value |
|---|---|---|
| `primary` | Primary | #1f5f4b |
| `dark` | Dark | #12261f |
| `surface` | Surface | #ffffff |
| `neutral` | Neutral | #f4f4f1 |
| `ink` | Ink | #1b1b1b |
| `muted` | Muted | #5c625f |

Brand colour is for buttons, key accents and at most one CTA band. It is not a
section surface. Alternate `surface` and `neutral` for section backgrounds.

## Type scale

| Slug | Size | Class |
|---|---|---|
| `small` | 0.875rem | `has-small-font-size` |
| `body` | 1rem | `has-body-font-size` |
| `h3` | 1.375rem | `has-h-3-font-size` |
| `h2` | 1.875rem | `has-h-2-font-size` |
| `h1` | 2.5rem | `has-h-1-font-size` |
| `display` | clamp(2.5rem, 1.8rem + 3vw, 4rem) | `has-display-font-size` |

## Spacing scale

| Slug | Size | Reference | CSS |
|---|---|---|---|
| `10` | 8px | `var:preset\|spacing\|10` | `var(--wp--preset--spacing--10)` |
| `20` | 16px | `var:preset\|spacing\|20` | `var(--wp--preset--spacing--20)` |
| `30` | 24px | `var:preset\|spacing\|30` | `var(--wp--preset--spacing--30)` |
| `40` | 40px | `var:preset\|spacing\|40` | `var(--wp--preset--spacing--40)` |
| `50` | 64px | `var:preset\|spacing\|50` | `var(--wp--preset--spacing--50)` |
| `60` | 96px | `var:preset\|spacing\|60` | `var(--wp--preset--spacing--60)` |

Block attributes take the slug as written. Classes and inline styles use the
kebab-cased name WordPress declares, as in the last column of each table.

Section rhythm: default `50`, tight
`40`, loose `60`.

## Layout

Content 720px, wide 1200px. Root padding 24px on each side, with root padding
aware alignments, so full width sections keep their gutters.

## Registered patterns

| Slug | Title |
|---|---|
| `agency-site/hero` | Hero |
| `agency-site/services-grid` | Services grid |
| `agency-site/about-media-text` | About, media beside text |
| `agency-site/cta-band` | CTA band |
| `agency-site/faq` | FAQ |

## Lessons

- Long Finnish and Swedish compounds carry manual `&shy;` soft hyphens. Never
  automatic word break.
- Paste generated markup into the Code editor view and save without flipping to
  visual first.
