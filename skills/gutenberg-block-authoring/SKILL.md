---
name: gutenberg-block-authoring
description: >
  Use when generating WordPress Gutenberg block markup for posts, pages, templates,
  or patterns for WordPress 7.0 and compatible Gutenberg releases. Produces valid
  serialized block content that never triggers block recovery or validation errors.
  Covers all core blocks, attributes, nesting rules,
  color/style patterns, content patterns (hero, CTA, FAQ), query loops, template
  blocks, and WordPress VIP constraints.
allowed-tools: Read, Grep, Glob, Bash
---

# Gutenberg Block Content Authoring

Generate valid WordPress Gutenberg block markup that never triggers block recovery or validation errors.

**Compatibility baseline:** WordPress 7.0 "Armstrong". The bundled `block-reference.json` is generated from the Gutenberg `wp/7.0` branch at commit `a2a354cf35e5b69c3330d6c1cfd42d8dc2efb9fd`, which WordPress.org identifies as the block editor source for WordPress 7.0.

---

## 1. Block Serialization Grammar

Every Gutenberg post is stored as HTML with block delimiter comments.

### Paired Blocks (have visible HTML content or inner blocks)

```
<!-- wp:block-name {"attr":"value"} -->
<tag class="wp-block-block-name">Content here</tag>
<!-- /wp:block-name -->
```

### Self-Closing Blocks (no HTML content between delimiters)

```
<!-- wp:block-name {"attr":"value"} /-->
```

### Rules

1. **Block name**: Always `namespace/block-name`. Core blocks use `core/` but the `core/` prefix is **omitted** in the comment delimiter. Write `<!-- wp:paragraph -->` not `<!-- wp:core/paragraph -->`.
2. **JSON attributes**: Valid JSON object immediately after the block name, separated by a single space. No trailing commas, no JS comments, no single quotes. Omit the JSON object entirely (not even `{}`) when all attributes are at their defaults.
3. **Opening/closing names must match exactly**: `<!-- wp:heading -->` must close with `<!-- /wp:heading -->`.
4. **Self-closing blocks**: Use `<!-- wp:block-name /-->` (space before `/-->`) only for blocks with no inner HTML content. Dynamically rendered blocks (archives, latest-posts, search, etc.) and blocks like `shortcode` and `pattern` use self-closing format.
5. **HTML content must match attributes**: For blocks where attributes are sourced from HTML (e.g., `wp:image` sources `url` from `<img src>`), the HTML attribute values must match the JSON comment attributes exactly. Mismatches cause validation errors.
6. **Attribute source types**:
   - `"source": "attribute"` — value is read from an HTML attribute on the `selector` element
   - `"source": "rich-text"` — value is read from innerHTML of the `selector` element
   - No source: the parser reads the value only from the JSON comment, never from the HTML. When save() also renders it (cover `url` as `src`, cover `alt`), the HTML must carry the same value or the block goes to recovery
7. **Class names**: Block wrapper elements get `wp-block-{name}` class (hyphens replace slashes, e.g., `wp-block-image`). The block editor adds this automatically via `useBlockProps`. When writing raw serialized markup, you MUST include it. Preset classes use the slug kebab-cased the way WordPress does, with a hyphen between a letter and a digit: `"fontSize":"h2"` gives `has-h-2-font-size`, and `"backgroundColor":"accent2"` gives `has-accent-2-background-color`.
8. **Nesting**: Inner blocks go between the opening and closing delimiters of the parent. Maintain proper indentation for readability but whitespace between blocks is not significant for parsing.

### What Causes Block Recovery (Validation Errors)

| Error | Cause |
|-------|-------|
| Mismatched delimiters | `<!-- wp:heading -->...<!-- /wp:paragraph -->` |
| Invalid JSON | Trailing comma, single quotes, unquoted keys |
| Missing required HTML structure | `wp:image` without `<figure>` wrapper or `<img>` tag |
| Wrong attribute types | String where number expected (e.g., `"level": "2"` instead of `"level": 2`) |
| Attribute/HTML mismatch | JSON says `"url":"a.jpg"` but `<img src="b.jpg">` |
| Wrong nesting | `wp:column` outside of `wp:columns` |
| Missing block class | `<figure>` instead of `<figure class="wp-block-image">` |
| Deprecated attributes | Using old attribute names from previous block API versions |
| Extra/missing HTML elements | Adding elements the block's save function doesn't render |
| Wrong tag name | `<div>` where block expects `<p>`, or `<section>` where block expects `<div>` |
| Non-Gutenberg HTML comments | Any `<!-- comment -->` that is not a `<!-- wp:block-name -->` delimiter — see rule below |
| Missing conditional class on button | `has-custom-font-size` missing when fontSize is set, or `has-border-color` missing when border color is set |
| Wrong CSS property order | Button `<a>` style must follow: border → color → spacing → typography. Gutenberg's save.js enforces this exact order |

### CRITICAL: No Freestanding HTML Comments

**Never insert any HTML comment that is not a valid Gutenberg block delimiter.**

The normal valid comment syntax in Gutenberg serialized content is:
- `<!-- wp:block-name {"attr":"value"} -->` — block opening
- `<!-- /wp:block-name -->` — block closing
- `<!-- wp:block-name {"attr":"value"} /-->` — self-closing block

Only two core blocks intentionally save non-delimiter comments inside their own paired block content:
- `wp:more` saves `<!--more-->` or `<!--more Custom text-->`
- `wp:nextpage` saves `<!--nextpage-->`

Any other HTML comment — including section separators, labels, or dividers — is **invalid** and will break the block editor:

```html
<!-- ❌ NEVER DO THIS — breaks Gutenberg -->
<!-- ── HERO SECTION ──────────────────── -->
<!-- Section: Features -->
<!-- TODO: update this -->

<!-- ✅ ONLY valid comments are block delimiters -->
<!-- wp:group -->
<!-- /wp:group -->
```

This applies everywhere in the output: top-level, nested, inline. No exceptions.

---

## 2. High-Value Block Reference

### wp:paragraph

Plain text paragraph. The most common block.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| content | rich-text | — | Sourced from `<p>` innerHTML |
| dropCap | boolean | false | |
| direction | string | — | `"ltr"` or `"rtl"` |

### CRITICAL: `<p>` tag NEVER gets `wp-block-paragraph` class

The paragraph block's `save()` function does **NOT** add `wp-block-paragraph` to the `<p>` element. Adding it causes every paragraph to fail validation and require block recovery.

The `<p>` tag only gets:
- Alignment class (`has-text-align-center`, etc.) when `style.typography.textAlign` is set
- Named color classes (`has-white-color has-text-color`) when `textColor` attribute is used
- Inline styles from `style` attribute values
- `has-drop-cap` when `dropCap` is true

**Serialized markup:**

Plain paragraph:
```html
<!-- wp:paragraph -->
<p>Hello world</p>
<!-- /wp:paragraph -->
```

With named textColor + alignment:
```html
<!-- wp:paragraph {"style":{"typography":{"textAlign":"center"}},"textColor":"white"} -->
<p class="has-text-align-center has-white-color has-text-color">Centered white text</p>
<!-- /wp:paragraph -->
```

With custom typography styles (fontSize, fontWeight, lineHeight, letterSpacing, textTransform):
```html
<!-- wp:paragraph {"style":{"typography":{"fontSize":"1.25rem","fontWeight":"600","lineHeight":"1.7"}}} -->
<p style="font-size:1.25rem;font-weight:600;line-height:1.7">Styled paragraph</p>
<!-- /wp:paragraph -->
```

With custom hex color AND typography styles:
```html
<!-- wp:paragraph {"style":{"color":{"text":"#38bdf8"},"typography":{"fontSize":"13px","fontWeight":"700","letterSpacing":"3px","textTransform":"uppercase","textAlign":"center"}}} -->
<p class="has-text-align-center has-text-color" style="color:#38bdf8;font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase">Eyebrow text</p>
<!-- /wp:paragraph -->
```

With drop cap:
```html
<!-- wp:paragraph {"dropCap":true} -->
<p class="has-drop-cap">Once upon a time in a land far away, there lived a brave adventurer.</p>
<!-- /wp:paragraph -->
```

### CRITICAL: Custom hex text color uses `style.color.text` — NOT `style.typography.color`

`style.typography.color` does **NOT exist** in Gutenberg. Using it will cause block recovery. Custom hex text color is always set via `style.color.text`, which renders as `color:#hex` inline style + `has-text-color` class in HTML.

```
❌ WRONG — style.typography.color does not exist, causes block recovery:
<!-- wp:paragraph {"style":{"typography":{"color":"#0f172a"}}} -->

✅ CORRECT — use style.color.text, color appears in HTML:
<!-- wp:paragraph {"style":{"color":{"text":"#0f172a"},"typography":{"fontSize":"1rem","fontWeight":"600"}}} -->
<p class="has-text-color" style="color:#0f172a;font-size:1rem;font-weight:600">text</p>
<!-- /wp:paragraph -->
```

This rule applies to **all blocks**: paragraphs, headings, groups, and any block with custom hex text color.

**Color storage rules:**

| How color is set | JSON attribute | HTML output |
|---|---|---|
| Named theme color | `"textColor":"white"` | `class="has-white-color has-text-color"` |
| Custom hex | `"style":{"color":{"text":"#fff"}}` | `class="has-text-color" style="color:#fff"` |

**Gotchas:**
- **NEVER add `wp-block-paragraph` class to `<p>`** — this is the #1 cause of mass block recovery
- **NEVER use `style.typography.color`** — this path does not exist in Gutenberg and causes block recovery
- Drop cap class is `has-drop-cap` on the `<p>` tag
- `content` is rich-text: supports `<strong>`, `<em>`, `<a href="">`, `<code>`, `<mark>` inline elements
- Named `textColor` attribute → `has-{slug}-color has-text-color` classes on `<p>`
- Text alignment via `style.typography.textAlign` → `has-text-align-{value}` class on `<p>`
- `style.typography` properties that go in HTML: `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textTransform`, `textAlign` (as class)
- `style.color.text` renders as `color:#hex` in HTML + `has-text-color` class

---

### wp:heading

Heading levels 1–6.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| content | rich-text | — | Sourced from heading tag innerHTML |
| level | integer | 2 | 1–6, determines tag: h1–h6 |

**Serialized markup:**

```html
<!-- wp:heading -->
<h2 class="wp-block-heading">Section Title</h2>
<!-- /wp:heading -->
```

H3 with custom level:

```html
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Subsection</h3>
<!-- /wp:heading -->
```

With anchor:

```html
<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading" id="my-anchor">Anchored Heading</h2>
<!-- /wp:heading -->
```

**Gotchas:**
- `level` must be an integer, not a string
- The HTML tag MUST match the level: `"level":3` → `<h3>`, never `<h2>`
- Default level is 2 — omit from JSON when using `<h2>`
- Class is `wp-block-heading` (not `wp-block-h2` or similar)
- **NEVER use `style.typography.color`** — this path does not exist. Use `style.color.text` for custom hex color
- Example: `{"style":{"color":{"text":"#2563eb"},"typography":{"fontSize":"2rem","fontWeight":"900"}}}` → `<h2 class="wp-block-heading has-text-color" style="color:#2563eb;font-size:2rem;font-weight:900">`
- Text alignment uses `style.typography.textAlign`, NOT a top-level `textAlign` attribute

---

### wp:image

Image with optional caption and link.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| url | string | — | Sourced from `<img src>` |
| alt | string | "" | Sourced from `<img alt>` |
| caption | rich-text | — | Sourced from `<figcaption>` |
| id | number | — | WordPress attachment ID |
| width | string | — | CSS width value |
| height | string | — | CSS height value |
| sizeSlug | string | — | e.g., "large", "medium", "thumbnail" |
| href | string | — | Link URL, sourced from `<figure > a href>` |
| linkTarget | string | — | Sourced from `<figure > a target>` |
| linkDestination | string | — | "none", "media", "attachment", "custom" |
| aspectRatio | string | — | CSS aspect-ratio value |
| scale | string | — | CSS object-fit value |

**Serialized markup:**

Basic image:

```html
<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/photo.jpg" alt="A photo" class="wp-image-42"/></figure>
<!-- /wp:image -->
```

Image with caption:

```html
<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/photo.jpg" alt="A photo" class="wp-image-42"/><figcaption class="wp-element-caption">Photo caption here</figcaption></figure>
<!-- /wp:image -->
```

Image linked to URL:

```html
<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"custom"} -->
<figure class="wp-block-image size-large"><a href="https://example.com"><img src="https://example.com/photo.jpg" alt="" class="wp-image-42"/></a></figure>
<!-- /wp:image -->
```

Image with custom dimensions:

```html
<!-- wp:image {"id":42,"width":"300px","height":"auto","sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large is-resized"><img src="https://example.com/photo.jpg" alt="" class="wp-image-42" style="width:300px;height:auto"/></figure>
<!-- /wp:image -->
```

**Gotchas:**
- `<figure>` is required wrapper with class `wp-block-image`
- `<img>` class must include `wp-image-{id}` when `id` is set
- `sizeSlug` adds `size-{slug}` to figure class
- `<figcaption>` class must be `wp-element-caption`
- `id` must be a number, not a string
- `url` in JSON and `src` in `<img>` must match exactly
- `is-resized` class added to figure when `width` or `height` is set
- Styles: `default` (no class) and `rounded` (add `is-style-rounded` to figure)

---

### wp:gallery

Container for image blocks with gallery layout.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| columns | integer | — | Number of columns |
| imageCrop | boolean | true | Crop images to uniform size |
| caption | rich-text | — | Gallery caption |
| linkTo | string | — | "none", "media", "attachment" |
| randomOrder | boolean | false | |

**Serialized markup:**

```html
<!-- wp:gallery {"linkTo":"none","columns":2} -->
<figure class="wp-block-gallery has-nested-images columns-2 is-cropped">
<!-- wp:image {"id":1,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/a.jpg" alt="" class="wp-image-1"/></figure>
<!-- /wp:image -->

<!-- wp:image {"id":2,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/b.jpg" alt="" class="wp-image-2"/></figure>
<!-- /wp:image -->
</figure>
<!-- /wp:gallery -->
```

**Gotchas:**
- Gallery is a `<figure>` containing `wp:image` inner blocks
- Classes: `wp-block-gallery has-nested-images columns-{n}`
- Add `is-cropped` class when `imageCrop` is true (the default)
- `columns-default` class when columns is not specified
- Caption goes inside the `<figure>` after all images with class `blocks-gallery-caption wp-element-caption`

---

### wp:group

Generic container for any blocks. Layout wrapper.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| tagName | string | "div" | HTML tag: div, section, aside, main, header, footer |
| templateLock | string\|boolean | — | "all", "insert", "contentOnly", false |

**Serialized markup:**

Basic group (uses default `<div>` tag):

```html
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
<!-- wp:paragraph -->
<p>Content inside group</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
```

Group with background color:

```html
<!-- wp:group {"backgroundColor":"pale-pink","layout":{"type":"constrained"}} -->
<div class="wp-block-group has-pale-pink-background-color has-background">
<!-- wp:paragraph -->
<p>Pink background content</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
```

Row layout (horizontal):

```html
<!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group">
<!-- wp:paragraph -->
<p>Left</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Right</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
```

Stack layout (vertical with gap):

```html
<!-- wp:group {"layout":{"type":"flex","orientation":"vertical"}} -->
<div class="wp-block-group">
<!-- wp:paragraph -->
<p>Top</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Bottom</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
```

**Gotchas:**
- Always include `layout` in JSON attributes — group needs it to define constrained, flex, or flow behavior
- `layout.type` options: `"constrained"` (centered max-width), `"flex"` (flexbox), `"default"` / `"flow"` (block flow)
- Color classes follow pattern: `has-{slug}-background-color has-background` and `has-{slug}-color has-text-color`
- `tagName` defaults to `"div"` — only include in JSON when using a different tag

---

### wp:columns

Multi-column layout container. Only accepts `wp:column` children.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| verticalAlignment | string | — | "top", "center", "bottom" |
| isStackedOnMobile | boolean | true | |

**Serialized markup:**

Two equal columns:

```html
<!-- wp:columns -->
<div class="wp-block-columns">
<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:paragraph -->
<p>Column 1</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:paragraph -->
<p>Column 2</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->
```

Three columns with custom widths:

```html
<!-- wp:columns -->
<div class="wp-block-columns">
<!-- wp:column {"width":"25%"} -->
<div class="wp-block-column" style="flex-basis:25%">
<!-- wp:paragraph -->
<p>Sidebar</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->

<!-- wp:column {"width":"50%"} -->
<div class="wp-block-column" style="flex-basis:50%">
<!-- wp:paragraph -->
<p>Main content</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->

<!-- wp:column {"width":"25%"} -->
<div class="wp-block-column" style="flex-basis:25%">
<!-- wp:paragraph -->
<p>Sidebar</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->
```

**Gotchas:**
- `wp:columns` ONLY accepts `wp:column` as direct children
- `wp:column` MUST be inside `wp:columns` (has `parent: ["core/columns"]`)
- Column `width` is a string percentage (e.g., `"25%"`) rendered as `style="flex-basis:25%"`
- `is-not-stacked-on-mobile` class added when `isStackedOnMobile` is false
- Vertical alignment: `are-vertically-aligned-{value}` on the columns wrapper

---

### wp:column

Single column inside `wp:columns`. Must be a direct child of columns.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| verticalAlignment | string | — | |
| width | string | — | e.g., "33.33%" |

See columns examples above.

---

### wp:cover

Image/video background with overlay and inner content.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| url | string | — | Background media URL |
| id | number | — | Attachment ID |
| alt | string | "" | Alt text for background image. Not parsed from the HTML: write it in the comment JSON and on the `<img>`, see gotchas |
| dimRatio | number | 100 | Overlay opacity 0–100 |
| overlayColor | string | — | Named color slug |
| customOverlayColor | string | — | Hex color |
| backgroundType | string | "image" | "image" or "video" |
| hasParallax | boolean | false | |
| isRepeated | boolean | false | |
| isDark | boolean | true | Dark/light scheme toggle |
| minHeight | number | — | |
| minHeightUnit | string | — | "px", "vh", etc. |
| focalPoint | object | — | `{x: 0.5, y: 0.5}` |
| gradient | string | — | Named gradient slug |
| customGradient | string | — | CSS gradient value |
| contentPosition | string | — | e.g., "top left", "center center" |
| tagName | string | "div" | |

**Serialized markup:**

Cover with background image:

```html
<!-- wp:cover {"url":"https://example.com/hero.jpg","id":10,"alt":"Fleet at the harbour","dimRatio":50,"overlayColor":"black","isUserOverlayColor":true} -->
<div class="wp-block-cover"><img class="wp-block-cover__image-background wp-image-10" alt="Fleet at the harbour" src="https://example.com/hero.jpg" data-object-fit="cover"/><span aria-hidden="true" class="wp-block-cover__background has-black-background-color has-background-dim"></span><div class="wp-block-cover__inner-container">
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading">Hero Title</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Subtitle text over the image</p>
<!-- /wp:paragraph -->
</div></div>
<!-- /wp:cover -->
```

Cover with solid color (no image):

```html
<!-- wp:cover {"overlayColor":"vivid-purple","isUserOverlayColor":true,"isDark":true} -->
<div class="wp-block-cover"><span aria-hidden="true" class="wp-block-cover__background has-vivid-purple-background-color has-background-dim-100 has-background-dim"></span><div class="wp-block-cover__inner-container">
<!-- wp:paragraph -->
<p>Content on purple background</p>
<!-- /wp:paragraph -->
</div></div>
<!-- /wp:cover -->
```

**Gotchas:**
- **Element order inside wrapper**: `<img>` (or `<video>`) FIRST, then `<span>` overlay, then `<div class="wp-block-cover__inner-container">`. Getting this order wrong causes block recovery.
- **No `<span>` before `<img>`**: The overlay span always comes AFTER the media element, not before.
- **`alt` lives in the comment JSON, not only on the `<img>`.** Unlike `wp:image`, the cover's `alt` attribute has had no HTML source since WordPress 6.5, so the parser never reads it back from `<img alt>`. Alt text written only on the `<img>` makes save() output `alt=""`, and the block goes to recovery. Write it in both places, identically, as in the example above. Decorative images keep `alt=""` on the `<img>` and omit `alt` from the JSON. A `hasParallax` or `isRepeated` cover has no `<img>`: save() puts the alt on the background `<div>` as `role="img" aria-label="Fleet at the harbour"` instead.
- `focalPoint` `{"x":0.5,"y":0.62}` adds `style="object-position:50% 62%"` and `data-object-position="50% 62%"` to the `<img>` (rounded to whole percent).
- A `customGradient` overlay over an image adds `has-background-gradient` to the overlay span and `style="background:<gradient>"`, plus `wp-block-cover__gradient-background` unless `dimRatio` is 0.
- `dimRatio` maps to class `has-background-dim-{value}`, rounded to the nearest 10 (e.g. `has-background-dim-60`), PLUS `has-background-dim`. A `dimRatio` of exactly 50 gets `has-background-dim` alone. Never use `style="opacity:0.6"`; use the CSS class.
- When `isDark` is false, add `is-light` class to outer div
- Image element: class `wp-block-cover__image-background wp-image-{id}`, with `data-object-fit="cover"`
- Video element: class `wp-block-cover__video-background`, with `autoplay muted loop playsinline`
- Default `dimRatio` is 100 (fully opaque overlay) when no image URL is set

---

### wp:buttons

Container for button blocks.

**Serialized markup:**

```html
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button">Click Me</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
```

---

### wp:button

Single button. Must be inside `wp:buttons`.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| url | string | — | Button link URL |
| title | string | — | Title attribute (soft-deprecated) |
| text | rich-text | — | Button label |
| linkTarget | string | — | `"_blank"` for new tab |
| rel | string | — | Link rel attribute |
| tagName | string | "a" | `"a"` or `"button"` |

**Serialized markup:**

Link button (default):

```html
<!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="https://example.com">Learn More</a></div>
<!-- /wp:button -->
```

Button with style (fill is default):

```html
<!-- wp:button {"backgroundColor":"vivid-cyan-blue","textColor":"white"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-white-color has-vivid-cyan-blue-background-color has-text-color has-background wp-element-button" href="https://example.com">Get Started</a></div>
<!-- /wp:button -->
```

Outline style:

```html
<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="https://example.com">Outline Button</a></div>
<!-- /wp:button -->
```

Multiple buttons in a row:

```html
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"backgroundColor":"vivid-cyan-blue"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-vivid-cyan-blue-background-color has-background wp-element-button" href="https://example.com">Primary</a></div>
<!-- /wp:button -->

<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="https://example.com/about">Secondary</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
```

Button with custom colors, font size, border, and padding:

```html
<!-- wp:button {"style":{"color":{"background":"#22c55e","text":"#0c1f0e"},"border":{"radius":"8px"},"spacing":{"padding":{"top":"18px","bottom":"18px","left":"40px","right":"40px"}},"typography":{"fontWeight":"700","fontSize":"1.05rem"}}} -->
<div class="wp-block-button"><a class="wp-block-button__link has-text-color has-background has-custom-font-size wp-element-button" style="border-radius:8px;color:#0c1f0e;background-color:#22c55e;padding-top:18px;padding-right:40px;padding-bottom:18px;padding-left:40px;font-size:1.05rem;font-weight:700">Get Started</a></div>
<!-- /wp:button -->
```

Outline button with custom border color and font size:

```html
<!-- wp:button {"className":"is-style-outline","style":{"color":{"text":"#4ade80"},"border":{"radius":"8px","color":"#4ade80","width":"2px"},"spacing":{"padding":{"top":"18px","bottom":"18px","left":"40px","right":"40px"}},"typography":{"fontWeight":"700","fontSize":"1.05rem"}}} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link has-text-color has-border-color has-custom-font-size wp-element-button" style="border-color:#4ade80;border-width:2px;border-radius:8px;color:#4ade80;padding-top:18px;padding-right:40px;padding-bottom:18px;padding-left:40px;font-size:1.05rem;font-weight:700">Learn More</a></div>
<!-- /wp:button -->
```

### CRITICAL: Button `<a>` class and style rules

Buttons are the most error-prone block. Every styled button MUST follow these rules exactly or it will trigger block recovery.

**Step 1 — Build the `<a>` class list in this exact order:**

| Condition | Class to add | Where |
|-----------|-------------|-------|
| Always | `wp-block-button__link` | `<a>` |
| `textColor` named slug | `has-{slug}-color has-text-color` | `<a>` |
| `style.color.text` hex | `has-text-color` | `<a>` |
| `backgroundColor` named slug | `has-{slug}-background-color has-background` | `<a>` |
| `style.color.background` hex | `has-background` | `<a>` |
| `borderColor` named slug OR `style.border.color` hex | `has-border-color` | `<a>` |
| `fontSize` named preset | `has-{slug}-font-size` | `<a>` |
| `fontSize` preset OR `style.typography.fontSize` | `has-custom-font-size` | `<a>` |
| Always (last) | `wp-element-button` | `<a>` |

`{slug}` is kebab-cased as in rule 7: `"fontSize":"h2"` gives `has-h-2-font-size`.

**Step 2 — Build the `<a>` inline `style` in this exact property order:**

```
border-color → border-width → border-radius → color → background-color → padding-* → font-size → font-weight
```

The order is: **border → color → spacing → typography**. Gutenberg's save.js spreads styles as `...borderProps, ...colorProps, ...spacingProps, ...typographyProps`. Mismatched order causes block recovery.

**Step 3 — Wrapper `<div>` classes:**

| Condition | Class on wrapper `<div>` |
|-----------|------------------------|
| Always | `wp-block-button` |
| Outline style | `is-style-outline` |

**Gotchas:**
- `wp:button` should be direct child of `wp:buttons`
- `url` attribute in JSON maps to `href` on the `<a>` element
- Color classes go on the `<a>` element, NOT the wrapper div
- **NEVER forget `has-custom-font-size`** when any font size is set — this is the #1 cause of button block recovery
- **NEVER forget `has-border-color`** when any border color is set — this is the #2 cause of button block recovery

---

### wp:list

Ordered or unordered list. Only accepts `wp:list-item` children.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| ordered | boolean | false | true = `<ol>`, false = `<ul>` |
| type | string | — | List style type (e.g., "lower-alpha") |
| start | integer | — | Start number for ordered lists |
| reversed | boolean | — | Reverse numbering |

### wp:list-item

Single list item. Must be inside `wp:list`.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| content | rich-text | — | Sourced from `<li>` innerHTML |

**Serialized markup:**

Unordered list:

```html
<!-- wp:list -->
<ul class="wp-block-list">
<!-- wp:list-item -->
<li>First item</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Second item</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Third item</li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
```

Ordered list:

```html
<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list">
<!-- wp:list-item -->
<li>Step one</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Step two</li>
<!-- /wp:list-item -->
</ol>
<!-- /wp:list -->
```

Nested list:

```html
<!-- wp:list -->
<ul class="wp-block-list">
<!-- wp:list-item -->
<li>Parent item
<!-- wp:list -->
<ul class="wp-block-list">
<!-- wp:list-item -->
<li>Nested child</li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
</li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
```

**Gotchas:**
- `wp:list` wraps `<ul>` or `<ol>` with class `wp-block-list`
- `wp:list-item` renders `<li>` — content is inline in the `<li>`, NOT wrapped in `<p>`
- Nested lists: a `wp:list` goes inside a `wp:list-item` as an inner block, between the text content and `</li>`
- `wp:list-item` has `parent: ["core/list"]`
- `ordered` must be boolean, not string

---

### wp:quote

Block quote with optional citation. Contains inner blocks for the quoted content.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| value | rich-text | — | (deprecated — content uses inner blocks now) |
| citation | rich-text | — | Sourced from `<cite>` |

**Serialized markup:**

```html
<!-- wp:quote -->
<blockquote class="wp-block-quote">
<!-- wp:paragraph -->
<p>The only way to do great work is to love what you do.</p>
<!-- /wp:paragraph -->
<cite>Steve Jobs</cite></blockquote>
<!-- /wp:quote -->
```

Without citation:

```html
<!-- wp:quote -->
<blockquote class="wp-block-quote">
<!-- wp:paragraph -->
<p>To be or not to be, that is the question.</p>
<!-- /wp:paragraph -->
</blockquote>
<!-- /wp:quote -->
```

**Gotchas:**
- Quote content uses inner blocks (typically `wp:paragraph`) — NOT a single `value` attribute
- `<cite>` goes inside `<blockquote>` after the inner blocks
- Styles: `default` and `plain` (`is-style-plain`)
- The `<cite>` is only rendered when `citation` attribute has content

---

### wp:pullquote

Styled pull quote. Does NOT use inner blocks — has its own `value` and `citation`.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| value | rich-text | — | Quote text, rendered as `<p>` |
| citation | rich-text | — | Attribution |

**Serialized markup:**

```html
<!-- wp:pullquote -->
<figure class="wp-block-pullquote"><blockquote><p>This is the highlighted quote text.</p><cite>Author Name</cite></blockquote></figure>
<!-- /wp:pullquote -->
```

**Gotchas:**
- Wrapper is `<figure class="wp-block-pullquote">` -> `<blockquote>` -> `<p>` + optional `<cite>`
- Unlike `wp:quote`, pullquote does NOT use inner blocks — it has its own `value` attribute rendered as `<p>`
- `<cite>` only rendered when citation is non-empty

---

### wp:separator

Horizontal rule / divider.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| opacity | string | — | `"css"` or `"alpha-channel"` |
| tagName | string | "hr" | `"hr"` or `"div"` |

**Serialized markup:**

Default:

```html
<!-- wp:separator -->
<hr class="wp-block-separator has-alpha-channel-opacity"/>
<!-- /wp:separator -->
```

Wide style:

```html
<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->
```

Dots style:

```html
<!-- wp:separator {"className":"is-style-dots"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-dots"/>
<!-- /wp:separator -->
```

**Gotchas:**
- Default renders `<hr>` (self-closing HTML element) but uses paired block comment syntax (NOT self-closing block)
- Styles: `default` (short line), `wide` (`is-style-wide`), `dots` (`is-style-dots`)
- Always include `has-alpha-channel-opacity` class
- The element is `<hr/>` — self-closing in HTML5

---

### wp:media-text

Side-by-side media and text layout.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| mediaAlt | string | "" | |
| mediaPosition | string | "left" | `"left"` or `"right"` |
| mediaType | string | — | `"image"` or `"video"` |
| mediaUrl | string | — | |
| mediaId | number | — | |
| mediaWidth | number | 50 | Percentage width of media side |
| isStackedOnMobile | boolean | true | |
| verticalAlignment | string | — | |
| imageFill | boolean | false | |

**Serialized markup:**

```html
<!-- wp:media-text {"mediaId":42,"mediaType":"image","mediaPosition":"left"} -->
<div class="wp-block-media-text is-stacked-on-mobile"><figure class="wp-block-media-text__media"><img src="https://example.com/photo.jpg" alt="Description" class="wp-image-42 size-full"/></figure><div class="wp-block-media-text__content">
<!-- wp:paragraph -->
<p>Text content next to the image.</p>
<!-- /wp:paragraph -->
</div></div>
<!-- /wp:media-text -->
```

Media on right:

```html
<!-- wp:media-text {"mediaId":42,"mediaType":"image","mediaPosition":"right"} -->
<div class="wp-block-media-text has-media-on-the-right is-stacked-on-mobile"><div class="wp-block-media-text__content">
<!-- wp:paragraph -->
<p>Text on the left side.</p>
<!-- /wp:paragraph -->
</div><figure class="wp-block-media-text__media"><img src="https://example.com/photo.jpg" alt="" class="wp-image-42 size-full"/></figure></div>
<!-- /wp:media-text -->
```

**Gotchas:**
- Structure: `<div>` wrapper with `<figure class="wp-block-media-text__media">` and `<div class="wp-block-media-text__content">`
- When `mediaPosition` is `"right"`, content comes BEFORE figure in DOM, and class `has-media-on-the-right` is added
- `is-stacked-on-mobile` class added when `isStackedOnMobile` is true (the default)
- Custom widths: `gridTemplateColumns` style applied when `mediaWidth` differs from 50
- Image class: `wp-image-{id} size-{slug}`

---

### wp:table

Data table with optional head, body, and foot sections.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| hasFixedLayout | boolean | true | Fixed table layout |
| caption | rich-text | — | Table caption |
| head | array | [] | Array of rows, each with cells |
| body | array | [] | Array of rows, each with cells |
| foot | array | [] | Array of rows, each with cells |

Each cell: `{ content: string, tag: "td"|"th", scope: string, align: string, colspan: string, rowspan: string }`

**Serialized markup:**

```html
<!-- wp:table -->
<figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody><tr><td>Alice</td><td>Engineer</td></tr><tr><td>Bob</td><td>Designer</td></tr></tbody></table></figure>
<!-- /wp:table -->
```

With caption and stripes style:

```html
<!-- wp:table {"className":"is-style-stripes"} -->
<figure class="wp-block-table is-style-stripes"><table class="has-fixed-layout"><tbody><tr><td>Row 1</td><td>Data</td></tr><tr><td>Row 2</td><td>Data</td></tr></tbody></table><figcaption class="wp-element-caption">Table caption</figcaption></figure>
<!-- /wp:table -->
```

**Gotchas:**
- Wrapped in `<figure class="wp-block-table">`
- `has-fixed-layout` class on `<table>` when `hasFixedLayout` is true (default)
- Head uses `<th>` tags with optional `scope` attribute
- Body uses `<td>` tags
- Caption uses `<figcaption class="wp-element-caption">` inside the `<figure>`
- Styles: `regular` (default), `stripes` (`is-style-stripes`)
- Cell alignment: `has-text-align-{left|center|right}` class and `data-align` attribute

---

### wp:html

Raw HTML block. Content is not validated against a schema.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| content | string | — | Raw HTML string |

**Serialized markup:**

```html
<!-- wp:html -->
<div class="custom-embed">
  <iframe src="https://example.com/widget" width="100%" height="400"></iframe>
</div>
<!-- /wp:html -->
```

**Gotchas:**
- NO `wp-block-html` class on the content — the HTML is rendered as-is
- Content goes directly between the block delimiters with no wrapper element
- This block has `"className": false` and `"html": false` in supports

---

### wp:shortcode

WordPress shortcode block.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| text | string | — | Raw shortcode text |

**Serialized markup:**

```html
<!-- wp:shortcode -->
[contact-form-7 id="123" title="Contact Form"]
<!-- /wp:shortcode -->
```

**Gotchas:**
- No wrapper HTML element — shortcode text goes directly between delimiters
- Shortcode is processed server-side during rendering
- No class names, no wrapper elements

---

### wp:pattern

Synced pattern (reusable block) reference.

**Serialized markup:**

```html
<!-- wp:pattern {"slug":"my-theme/hero-section"} /-->
```

**Gotchas:**
- Self-closing block — no inner content
- `slug` is the pattern identifier (e.g., `"theme-name/pattern-name"`)
- Content is resolved server-side
- Not available in inserter when `"inserter": false` in supports

---

### wp:template-part

Theme template part reference. Used in block theme templates.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| slug | string | — | Template part slug |
| theme | string | — | Theme slug |
| tagName | string | — | Wrapper tag |
| area | string | — | "header", "footer", "uncategorized" |

**Serialized markup:**

```html
<!-- wp:template-part {"slug":"header","theme":"my-theme","tagName":"header","area":"header"} /-->
```

**Gotchas:**
- Self-closing block format
- Content is loaded from the database or theme files at render time
- `area` helps the editor categorize the template part

---

### wp:spacer

Vertical or horizontal space.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| height | string | "100px" | CSS height value or spacing preset |
| width | string | — | CSS width value |

**Serialized markup:**

```html
<!-- wp:spacer -->
<div style="height:100px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->
```

Custom height:

```html
<!-- wp:spacer {"height":"50px"} -->
<div style="height:50px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->
```

**Gotchas:**
- Always has `aria-hidden="true"`
- Height/width can be spacing presets like `"var:preset|spacing|50"` which map to `var(--wp--preset--spacing--50)` in CSS

---

### wp:code

Preformatted code block.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| content | rich-text | — | Code content |

**Serialized markup:**

```html
<!-- wp:code -->
<pre class="wp-block-code"><code>function hello() {
  console.log("Hello world");
}</code></pre>
<!-- /wp:code -->
```

**Gotchas:**
- Structure: `<pre class="wp-block-code"><code>...</code></pre>`
- HTML entities in the content must be escaped (`<` -> `&lt;`, `>` -> `&gt;`, `&` -> `&amp;`)
- Preserve whitespace and line breaks exactly as intended

---

### wp:preformatted

Preformatted text (preserves whitespace).

**Serialized markup:**

```html
<!-- wp:preformatted -->
<pre class="wp-block-preformatted">  Indented text
  preserving all    spaces
  and line breaks</pre>
<!-- /wp:preformatted -->
```

---

### wp:details

Disclosure/accordion element.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| summary | string | "Details" | Summary/toggle text |
| showContent | boolean | — | Whether open by default |
| textColor | string | — | Named color slug — applied to `<details>` wrapper, inherited by `<summary>` |

**Serialized markup:**

```html
<!-- wp:details -->
<details class="wp-block-details"><summary>Click to expand</summary>
<!-- wp:paragraph -->
<p>Hidden content revealed on click.</p>
<!-- /wp:paragraph -->
</details>
<!-- /wp:details -->
```

Open by default:

```html
<!-- wp:details {"showContent":true} -->
<details class="wp-block-details" open><summary>Already expanded</summary>
<!-- wp:paragraph -->
<p>This content is visible by default.</p>
<!-- /wp:paragraph -->
</details>
<!-- /wp:details -->
```

### CRITICAL: `<summary>` text color — use `style.color.text` hex on the block

WordPress strips arbitrary `style` attributes from `<summary>` elements. Named `textColor` slugs (like `"white"`) do NOT reliably cascade to `<summary>` text across themes. The only approach **confirmed to work** (from real WordPress recovered output) is setting `style.color.text` with a hex value directly on the `wp:details` block. This renders as `color:#hex` inline style on the `<details>` element, which the `<summary>` inherits via CSS cascade.

**Correct pattern — confirmed from WordPress editor output:**

```html
<!-- wp:details {"style":{"color":{"text":"#f1f5f9"},"border":{"bottom":{"color":"#334155","width":"1px"}},"spacing":{"padding":{"top":"24px","bottom":"24px"}},"elements":{"link":{"color":{"text":"#f1f5f9"}}}}} -->
<details class="wp-block-details has-text-color has-link-color" style="border-bottom-color:#334155;border-bottom-width:1px;color:#f1f5f9;padding-top:24px;padding-bottom:24px"><summary>Question text here</summary>
<!-- wp:paragraph {"style":{"typography":{"lineHeight":"1.7"}}} -->
<p style="line-height:1.7">Answer text here in a readable color.</p>
<!-- /wp:paragraph -->
</details>
<!-- /wp:details -->
```

**Key rules:**
- `style.color.text` (hex) → outputs `color:#hex` inline on `<details>` → `<summary>` inherits ✅
- `textColor` named slug → outputs only a CSS class → does NOT reliably cascade to `<summary>` ❌
- **NEVER add `style="color:..."` to the `<summary>` tag** — WordPress strips it on save
- Body paragraph text inside `<details>` inherits the color too, so you usually don't need to set it separately
- Always include `"elements":{"link":{"color":{"text":"#hex"}}}` to match what WordPress itself generates

---

### wp:embed

Embeds from external services (YouTube, Twitter, etc.).

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| url | string | — | Embed URL |
| caption | rich-text | — | |
| type | string | — | e.g., "video", "rich" |
| providerNameSlug | string | — | e.g., "youtube", "twitter" |
| allowResponsive | boolean | true | |
| responsive | boolean | — | |

**Serialized markup:**

YouTube embed:

```html
<!-- wp:embed {"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","type":"video","providerNameSlug":"youtube","responsive":true,"className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"} -->
<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">
https://www.youtube.com/watch?v=dQw4w9WgXcQ
</div></figure>
<!-- /wp:embed -->
```

**Gotchas:**
- The URL goes as plain text inside `<div class="wp-block-embed__wrapper">` on its own line
- URL must be on its own line with newlines before and after
- Classes on figure: `wp-block-embed is-type-{type} is-provider-{slug} wp-block-embed-{slug}`
- WordPress oEmbed processes the URL server-side to generate the actual embed HTML

---

## 3. Color and Style Attribute Patterns

### Named Colors

WordPress ships with a default color palette. When using named colors, apply both the JSON attribute and the corresponding class:

```html
<!-- wp:paragraph {"backgroundColor":"pale-pink","textColor":"vivid-red"} -->
<p class="has-vivid-red-color has-pale-pink-background-color has-text-color has-background">Colored text</p>
<!-- /wp:paragraph -->
```

Pattern: `has-{slug}-color` + `has-text-color` for text, `has-{slug}-background-color` + `has-background` for background.

### Custom (Hex) Colors

`style.color.text` renders as `color:#hex` inline style + `has-text-color` class. Use this when hex text color MUST appear in the HTML (e.g. on dark backgrounds):

```html
<!-- wp:paragraph {"style":{"color":{"text":"#f1f5f9"}}} -->
<p class="has-text-color" style="color:#f1f5f9">Light text on dark background</p>
<!-- /wp:paragraph -->
```

With background color too:

```html
<!-- wp:paragraph {"style":{"color":{"text":"#ff0000","background":"#000000"}}} -->
<p class="has-text-color has-background" style="color:#ff0000;background-color:#000000">Custom colors</p>
<!-- /wp:paragraph -->
```

### CRITICAL: Two ways to set text color — both render in HTML

| Method | JSON | HTML output | Use when |
|---|---|---|---|
| Named slug | `"textColor":"white"` | `class="has-white-color has-text-color"` | Theme palette colors |
| Custom hex | `"style":{"color":{"text":"#fff"}}` | `class="has-text-color" style="color:#fff"` | Custom hex colors |

**`style.typography.color` does NOT exist in Gutenberg — never use it. Always use `style.color.text` for custom hex text colors.**

### Font Size

Named preset:

```html
<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size">Large text</p>
<!-- /wp:paragraph -->
```

Custom size:

```html
<!-- wp:paragraph {"style":{"typography":{"fontSize":"22px"}}} -->
<p style="font-size:22px">Custom sized text</p>
<!-- /wp:paragraph -->
```

### Alignment

Block alignment (via `align` support):

```html
<!-- wp:image {"align":"wide"} -->
<figure class="wp-block-image alignwide">...</figure>
<!-- /wp:image -->
```

Alignment classes: `alignleft`, `aligncenter`, `alignright`, `alignwide`, `alignfull`.

### WordPress 7.0 Visibility Metadata

WordPress 7.0 supports viewport-specific visibility through `metadata.blockVisibility`. This is stored only in the JSON comment; the saved HTML stays the same.

```html
<!-- wp:paragraph {"metadata":{"blockVisibility":{"viewport":{"mobile":false}}}} -->
<p>Hidden on mobile.</p>
<!-- /wp:paragraph -->
```

Rules:
- Hide everywhere: `"metadata":{"blockVisibility":false}`
- Hide by viewport: `"metadata":{"blockVisibility":{"viewport":{"mobile":false,"tablet":true,"desktop":true}}}`
- Supported viewport keys in WordPress 7.0: `mobile`, `tablet`, `desktop`
- Do not treat `blockVisibility` as boolean-only; in 7.0 it may be `false` or an object.

### WordPress 7.0 Block-Level Custom CSS

Custom CSS for one block instance is stored in `style.css`. When present, the saved wrapper/outer element must include `has-custom-css`.

```html
<!-- wp:heading {"level":3,"style":{"css":"color: blue;\n"}} -->
<h3 class="wp-block-heading has-custom-css">Styled by block CSS</h3>
<!-- /wp:heading -->
```

Rules:
- `style.css` contains declarations only. Do not include `<style>` tags.
- Use `&` for nested selectors when needed, e.g. `"& a { text-decoration: underline; }\n"`.
- Always include `has-custom-css` on the block's saved outer element when `style.css` is present.

### WordPress 7.0 Dimensions and Typography Additions

WordPress 7.0 adds standard `dimensions.width`, `dimensions.height`, and dimension presets for blocks that opt in. Use only the dimension keys supported by that block's `block.json`.

```html
<!-- wp:group {"style":{"dimensions":{"minHeight":"50vh"}},"layout":{"type":"constrained"}} -->
<div class="wp-block-group" style="min-height:50vh">
<!-- wp:paragraph -->
<p>Tall section content.</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
```

Paragraph also supports text columns and text indent in WordPress 7.0:

```html
<!-- wp:paragraph {"style":{"typography":{"textColumns":2,"textIndent":"2em"}}} -->
<p style="column-count:2;text-indent:2em">Multi-column paragraph text with an indented first line.</p>
<!-- /wp:paragraph -->
```

### Spacing

Padding and margin use the style object:

```html
<!-- wp:group {"style":{"spacing":{"padding":{"top":"2em","bottom":"2em","left":"2em","right":"2em"}}},"layout":{"type":"constrained"}} -->
<div class="wp-block-group" style="padding-top:2em;padding-right:2em;padding-bottom:2em;padding-left:2em">
...
</div>
<!-- /wp:group -->
```

Spacing presets: `"var:preset|spacing|50"` -> `var(--wp--preset--spacing--50)`.

---

## 4. Content Patterns

### Hero Section

Cover block with heading and paragraph:

```html
<!-- wp:cover {"url":"https://example.com/hero.jpg","id":10,"dimRatio":60,"overlayColor":"black","isUserOverlayColor":true,"minHeight":500,"minHeightUnit":"px","align":"full"} -->
<div class="wp-block-cover alignfull" style="min-height:500px"><img class="wp-block-cover__image-background wp-image-10" alt="" src="https://example.com/hero.jpg" data-object-fit="cover"/><span aria-hidden="true" class="wp-block-cover__background has-black-background-color has-background-dim-60 has-background-dim"></span><div class="wp-block-cover__inner-container">
<!-- wp:heading {"level":1,"style":{"typography":{"textAlign":"center"}}} -->
<h1 class="wp-block-heading has-text-align-center">Welcome to Our Site</h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"style":{"typography":{"textAlign":"center"}}} -->
<p class="has-text-align-center">Discover amazing content and join our community.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
<!-- wp:button {"backgroundColor":"white","textColor":"black"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-black-color has-white-background-color has-text-color has-background wp-element-button" href="https://example.com/start">Get Started</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div></div>
<!-- /wp:cover -->
```

### Two-Column Text Layout

```html
<!-- wp:columns {"align":"wide"} -->
<div class="wp-block-columns alignwide">
<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Left Column Title</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Content for the left column goes here. This creates a balanced two-column text layout suitable for comparison or side-by-side information.</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Right Column Title</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Content for the right column goes here. Each column can contain any combination of blocks including images, lists, and more.</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->
```

### Image with Caption and Pull Quote

```html
<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"none","align":"wide"} -->
<figure class="wp-block-image alignwide size-large"><img src="https://example.com/landscape.jpg" alt="Mountain landscape at sunset" class="wp-image-42"/><figcaption class="wp-element-caption">A breathtaking view of the mountain range at golden hour</figcaption></figure>
<!-- /wp:image -->

<!-- wp:pullquote -->
<figure class="wp-block-pullquote"><blockquote><p>Nature always wears the colors of the spirit.</p><cite>Ralph Waldo Emerson</cite></blockquote></figure>
<!-- /wp:pullquote -->
```

### CTA Section

Group with heading, paragraph, and button:

```html
<!-- wp:group {"backgroundColor":"pale-cyan-blue","layout":{"type":"constrained"}} -->
<div class="wp-block-group has-pale-cyan-blue-background-color has-background">
<!-- wp:heading {"style":{"typography":{"textAlign":"center"}}} -->
<h2 class="wp-block-heading has-text-align-center">Ready to Get Started?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"style":{"typography":{"textAlign":"center"}}} -->
<p class="has-text-align-center">Join thousands of satisfied customers and transform your workflow today.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
<!-- wp:button {"backgroundColor":"vivid-cyan-blue"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-vivid-cyan-blue-background-color has-background wp-element-button" href="https://example.com/signup">Sign Up Free</a></div>
<!-- /wp:button -->

<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="https://example.com/demo">Watch Demo</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
```

### Ordered and Unordered Lists

```html
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Features</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<!-- wp:list-item -->
<li>Lightning-fast performance</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Enterprise-grade security</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>24/7 customer support</li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Getting Started Steps</h3>
<!-- /wp:heading -->

<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list">
<!-- wp:list-item -->
<li>Create your account</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Configure your workspace</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Invite your team members</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Start collaborating</li>
<!-- /wp:list-item -->
</ol>
<!-- /wp:list -->
```

### Data Table

```html
<!-- wp:table {"hasFixedLayout":true,"className":"is-style-stripes"} -->
<figure class="wp-block-table is-style-stripes"><table class="has-fixed-layout"><thead><tr><th>Plan</th><th>Price</th><th>Storage</th><th>Users</th></tr></thead><tbody><tr><td>Starter</td><td>$9/mo</td><td>10 GB</td><td>1</td></tr><tr><td>Pro</td><td>$29/mo</td><td>100 GB</td><td>5</td></tr><tr><td>Enterprise</td><td>$99/mo</td><td>Unlimited</td><td>Unlimited</td></tr></tbody></table><figcaption class="wp-element-caption">Pricing comparison as of 2025</figcaption></figure>
<!-- /wp:table -->
```

### FAQ Section with Details Blocks

**On a light background (default, no color needed):**

```html
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
<!-- wp:heading -->
<h2 class="wp-block-heading">Frequently Asked Questions</h2>
<!-- /wp:heading -->

<!-- wp:details {"style":{"border":{"bottom":{"color":"#e2e8f0","width":"1px"}},"spacing":{"padding":{"top":"24px","bottom":"24px"}}}} -->
<details class="wp-block-details" style="border-bottom-color:#e2e8f0;border-bottom-width:1px;padding-top:24px;padding-bottom:24px"><summary>What payment methods do you accept?</summary>
<!-- wp:paragraph -->
<p>We accept all major credit cards, PayPal, and bank transfers.</p>
<!-- /wp:paragraph -->
</details>
<!-- /wp:details -->

<!-- wp:details {"style":{"border":{"bottom":{"color":"#e2e8f0","width":"1px"}},"spacing":{"padding":{"top":"24px","bottom":"24px"}}}} -->
<details class="wp-block-details" style="border-bottom-color:#e2e8f0;border-bottom-width:1px;padding-top:24px;padding-bottom:24px"><summary>Can I cancel my subscription?</summary>
<!-- wp:paragraph -->
<p>Yes, you can cancel at any time from your account settings. No cancellation fees apply.</p>
<!-- /wp:paragraph -->
</details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
```

**On a dark background — MUST use `style.color.text` hex on each `wp:details` block:**

The `<summary>` element inherits `color` from the `<details>` wrapper via CSS cascade. `style.color.text` hex is the ONLY method confirmed to render `color:#hex` inline on `<details>`, making the summary readable. `textColor` named slugs output only a CSS class and do NOT reliably cascade to `<summary>` across themes.

```html
<!-- wp:group {"style":{"color":{"background":"#0f172a"},"spacing":{"padding":{"top":"80px","bottom":"80px"}}}} -->
<div class="wp-block-group has-background" style="background-color:#0f172a;padding-top:80px;padding-bottom:80px">

<!-- wp:heading {"textColor":"white"} -->
<h2 class="wp-block-heading has-white-color has-text-color">Frequently Asked Questions</h2>
<!-- /wp:heading -->

<!-- wp:details {"style":{"color":{"text":"#f1f5f9"},"elements":{"link":{"color":{"text":"#f1f5f9"}}},"border":{"bottom":{"color":"#334155","width":"1px"}},"spacing":{"padding":{"top":"24px","bottom":"24px"}}}} -->
<details class="wp-block-details has-text-color has-link-color" style="border-bottom-color:#334155;border-bottom-width:1px;color:#f1f5f9;padding-top:24px;padding-bottom:24px"><summary>What payment methods do you accept?</summary>
<!-- wp:paragraph {"style":{"typography":{"lineHeight":"1.7"}}} -->
<p style="line-height:1.7">We accept all major credit cards, PayPal, and bank transfers.</p>
<!-- /wp:paragraph -->
</details>
<!-- /wp:details -->

<!-- wp:details {"style":{"color":{"text":"#f1f5f9"},"elements":{"link":{"color":{"text":"#f1f5f9"}}},"border":{"bottom":{"color":"#334155","width":"1px"}},"spacing":{"padding":{"top":"24px","bottom":"24px"}}}} -->
<details class="wp-block-details has-text-color has-link-color" style="border-bottom-color:#334155;border-bottom-width:1px;color:#f1f5f9;padding-top:24px;padding-bottom:24px"><summary>Can I cancel my subscription?</summary>
<!-- wp:paragraph {"style":{"typography":{"lineHeight":"1.7"}}} -->
<p style="line-height:1.7">Yes, you can cancel at any time from your account settings. No cancellation fees apply.</p>
<!-- /wp:paragraph -->
</details>
<!-- /wp:details -->

</div>
<!-- /wp:group -->
```

---

## 4b. Validated Real-World Patterns

These patterns are **confirmed working** — derived from real WordPress editor recovery output during live testing. Use these as authoritative references when unsure.

### Eyebrow / Label Paragraph (small all-caps text above headings)

Custom hex color uses `style.color.text` which renders as `color:#hex` + `has-text-color` class in HTML.

```html
<!-- wp:paragraph {"style":{"color":{"text":"#2563eb"},"typography":{"fontSize":"13px","fontWeight":"700","letterSpacing":"3px","textTransform":"uppercase","textAlign":"center"}}} -->
<p class="has-text-align-center has-text-color" style="color:#2563eb;font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase">Section Label</p>
<!-- /wp:paragraph -->
```

### White Heading on Dark Background

Use named `textColor` — outputs `has-white-color has-text-color` classes which reliably render white:

```html
<!-- wp:heading {"textColor":"white","style":{"typography":{"fontSize":"clamp(2rem,4vw,3rem)","fontWeight":"800","textAlign":"center"}}} -->
<h2 class="wp-block-heading has-text-align-center has-white-color has-text-color" style="font-size:clamp(2rem,4vw,3rem);font-weight:800">Heading text</h2>
<!-- /wp:heading -->
```

### Stat / Number Card Column

```html
<!-- wp:column {"style":{"spacing":{"padding":{"top":"40px","bottom":"40px","left":"40px","right":"40px"}},"color":{"background":"#ffffff"}}} -->
<div class="wp-block-column has-background" style="background-color:#ffffff;padding-top:40px;padding-right:40px;padding-bottom:40px;padding-left:40px">
<!-- wp:heading {"style":{"color":{"text":"#2563eb"},"typography":{"fontSize":"2.75rem","fontWeight":"900"}}} -->
<h2 class="wp-block-heading has-text-color" style="color:#2563eb;font-size:2.75rem;font-weight:900">99.99%</h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"style":{"color":{"text":"#0f172a"},"typography":{"fontWeight":"600","fontSize":"1rem"}}} -->
<p class="has-text-color" style="color:#0f172a;font-size:1rem;font-weight:600">Uptime SLA</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"style":{"color":{"text":"#64748b"},"typography":{"fontSize":"0.9rem"}}} -->
<p class="has-text-color" style="color:#64748b;font-size:0.9rem">Supporting description text.</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->
```

Note: Custom hex text color always uses `style.color.text` which renders as `color:#hex` inline style + `has-text-color` class.

### Feature Card (icon + heading + body + list)

```html
<!-- wp:group {"style":{"border":{"radius":"12px","color":"#e2e8f0","width":"1px"},"spacing":{"padding":{"top":"40px","bottom":"40px","left":"36px","right":"36px"}}}} -->
<div class="wp-block-group has-border-color" style="border-color:#e2e8f0;border-width:1px;border-radius:12px;padding-top:40px;padding-right:36px;padding-bottom:40px;padding-left:36px">
<!-- wp:paragraph {"style":{"typography":{"fontSize":"2.25rem"}}} -->
<p style="font-size:2.25rem">⚡</p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"style":{"color":{"text":"#0f172a"},"typography":{"fontSize":"1.25rem","fontWeight":"700"}}} -->
<h3 class="wp-block-heading has-text-color" style="color:#0f172a;font-size:1.25rem;font-weight:700">Feature Title</h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"style":{"color":{"text":"#475569"},"typography":{"lineHeight":"1.7"}}} -->
<p class="has-text-color" style="color:#475569;line-height:1.7">Feature description paragraph.</p>
<!-- /wp:paragraph -->
<!-- wp:separator {"style":{"color":{"background":"#e2e8f0"}}} -->
<hr class="wp-block-separator has-text-color has-alpha-channel-opacity has-background" style="background-color:#e2e8f0;color:#e2e8f0"/>
<!-- /wp:separator -->
<!-- wp:list {"style":{"color":{"text":"#475569"},"typography":{"fontSize":"0.9rem"}}} -->
<ul class="wp-block-list has-text-color" style="color:#475569;font-size:0.9rem">
<!-- wp:list-item -->
<li>First bullet point</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li>Second bullet point</li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
```

### Dark Section with Readable Body Text

For body text on dark backgrounds, use `style.color.text` so color renders inline:

```html
<!-- wp:group {"style":{"color":{"background":"#0f172a"},"spacing":{"padding":{"top":"96px","bottom":"96px"}}}} -->
<div class="wp-block-group has-background" style="background-color:#0f172a;padding-top:96px;padding-bottom:96px">
<!-- wp:heading {"textColor":"white","style":{"typography":{"fontSize":"2rem","fontWeight":"800"}}} -->
<h2 class="wp-block-heading has-white-color has-text-color" style="font-size:2rem;font-weight:800">Section heading</h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"style":{"color":{"text":"#94a3b8"},"typography":{"fontSize":"1.1rem","lineHeight":"1.7"}}} -->
<p class="has-text-color" style="color:#94a3b8;font-size:1.1rem;line-height:1.7">Body text that must be readable on dark background.</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
```

Note: `style.color.text` and `style.typography.*` coexist in the same `style` object. Color renders as `color:#hex` + `has-text-color` class; typography properties render as their respective CSS properties.

### Styled Button Pair (fill + outline) — Confirmed Working

This exact pattern was tested in Gutenberg and loads without block recovery. Note the class list and CSS property order on each `<a>`:

```html
<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
<!-- wp:button {"style":{"color":{"background":"#22c55e","text":"#0c1f0e"},"border":{"radius":"8px"},"spacing":{"padding":{"top":"18px","bottom":"18px","left":"40px","right":"40px"}},"typography":{"fontWeight":"700","fontSize":"1.05rem"}}} -->
<div class="wp-block-button"><a class="wp-block-button__link has-text-color has-background has-custom-font-size wp-element-button" style="border-radius:8px;color:#0c1f0e;background-color:#22c55e;padding-top:18px;padding-right:40px;padding-bottom:18px;padding-left:40px;font-size:1.05rem;font-weight:700">Primary Action</a></div>
<!-- /wp:button -->

<!-- wp:button {"className":"is-style-outline","style":{"color":{"text":"#4ade80"},"border":{"radius":"8px","color":"#4ade80","width":"2px"},"spacing":{"padding":{"top":"18px","bottom":"18px","left":"40px","right":"40px"}},"typography":{"fontWeight":"700","fontSize":"1.05rem"}}} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link has-text-color has-border-color has-custom-font-size wp-element-button" style="border-color:#4ade80;border-width:2px;border-radius:8px;color:#4ade80;padding-top:18px;padding-right:40px;padding-bottom:18px;padding-left:40px;font-size:1.05rem;font-weight:700">Secondary Action</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
```

Key points confirmed from this test:
- `has-custom-font-size` required when `style.typography.fontSize` is set
- `has-border-color` required when `style.border.color` is set
- Style order: `border-color → border-width → border-radius → color → background-color → padding-* → font-size → font-weight`
- Missing any of these causes immediate block recovery on every button

---

## 5. Theme & Template Blocks (Server-Rendered)

These blocks are rendered by PHP on the server. They use self-closing format OR paired format with inner blocks. Their JSON attributes must still be valid types and names — errors cause block recovery in the editor. No HTML content appears between delimiters for self-closing blocks.

### wp:query (Query Loop)

The primary loop block. Contains `wp:post-template` which iterates over matching posts.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| queryId | number | — | Auto-assigned unique ID |
| query | object | (see below) | Query parameters object |
| tagName | string | "div" | Wrapper HTML tag |
| namespace | string | — | Custom query namespace |
| enhancedPagination | boolean | false | Client-side pagination |

**query object defaults:**

```json
{
  "perPage": null,
  "pages": 0,
  "offset": 0,
  "postType": "post",
  "order": "desc",
  "orderBy": "date",
  "author": "",
  "search": "",
  "exclude": [],
  "sticky": "",
  "inherit": true,
  "taxQuery": null,
  "parents": [],
  "format": []
}
```

**Serialized markup:**

Standard blog loop (inherits from template context):

```html
<!-- wp:query {"queryId":1,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":true}} -->
<div class="wp-block-query">
<!-- wp:post-template -->
<!-- wp:post-title {"isLink":true} /-->
<!-- wp:post-date /-->
<!-- wp:post-excerpt /-->
<!-- /wp:post-template -->

<!-- wp:query-pagination -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->

<!-- wp:query-no-results -->
<!-- wp:paragraph -->
<p>No posts found.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
```

Custom query for a specific category:

```html
<!-- wp:query {"queryId":2,"query":{"perPage":6,"postType":"post","order":"desc","orderBy":"date","inherit":false,"taxQuery":{"category":[5]}}} -->
<div class="wp-block-query">
<!-- wp:post-template {"layout":{"type":"grid","columnCount":3}} -->
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9"} /-->
<!-- wp:post-title {"isLink":true,"level":3} /-->
<!-- wp:post-date /-->
<!-- wp:post-excerpt {"excerptLength":20} /-->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
```

**Gotchas:**
- `wp:query` is a paired block with a `<div>` wrapper (it has a save.js that renders inner blocks)
- `wp:post-template` is the iterator — it must be a descendant of `wp:query` (has `ancestor: ["core/query"]`)
- Set `"inherit": true` in templates to inherit the main query; set `"inherit": false` for custom loops
- `taxQuery` uses `{"taxonomy_name": [term_id_array]}` format — term IDs are numbers
- `queryId` should be unique per page when using multiple query loops

---

### wp:post-template

Iterates over query results. Must be inside `wp:query`. Contains the blocks that render each post.

**Serialized markup:**

```html
<!-- wp:post-template -->
<!-- wp:post-title {"isLink":true} /-->
<!-- wp:post-date /-->
<!-- wp:post-excerpt /-->
<!-- /wp:post-template -->
```

Grid layout:

```html
<!-- wp:post-template {"layout":{"type":"grid","columnCount":2}} -->
<!-- wp:post-featured-image {"isLink":true} /-->
<!-- wp:post-title {"isLink":true,"level":3} /-->
<!-- /wp:post-template -->
```

**Gotchas:**
- Paired block — inner blocks go between delimiters (it saves InnerBlocks.Content)
- Has `ancestor: ["core/query"]` — must be a descendant of query loop
- Layout support: can use grid or default flow

---

### wp:post-title

Displays the post title. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| level | number | 2 | Heading level 1–6 |
| isLink | boolean | false | Wrap title in permalink |
| rel | string | "" | Link rel attribute |
| linkTarget | string | "_self" | Link target |

**Serialized markup:**

```html
<!-- wp:post-title /-->
```

As linked H3:

```html
<!-- wp:post-title {"level":3,"isLink":true} /-->
```

**Gotchas:**
- `level` must be a number, not a string
- No HTML between delimiters — fully server-rendered

---

### wp:post-featured-image

Displays the post's featured image. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| isLink | boolean | false | Link image to post |
| aspectRatio | string | — | e.g., "16/9", "4/3", "1" |
| width | string | — | CSS width |
| height | string | — | CSS height |
| scale | string | "cover" | CSS object-fit |
| sizeSlug | string | — | Image size |
| rel | string | "" | |
| linkTarget | string | "_self" | |
| dimRatio | number | 0 | Overlay opacity |
| overlayColor | string | — | Named overlay color |
| gradient | string | — | Named gradient |
| useFirstImageFromPost | boolean | false | Fallback to first content image |

**Serialized markup:**

```html
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9"} /-->
```

With overlay:

```html
<!-- wp:post-featured-image {"isLink":true,"dimRatio":30,"overlayColor":"black"} /-->
```

---

### wp:post-excerpt

Displays the post excerpt. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| textAlign | string | — | |
| moreText | string | — | "Read more" link text |
| showMoreOnNewLine | boolean | true | |
| excerptLength | number | 55 | Word count |

**Serialized markup:**

```html
<!-- wp:post-excerpt /-->
```

With custom length and read more:

```html
<!-- wp:post-excerpt {"excerptLength":25,"moreText":"Continue reading"} /-->
```

---

### wp:post-date

Displays the post date. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| format | string | — | PHP date format string |
| isLink | boolean | false | Link date to post |
| textAlign | string | — | |

**Serialized markup:**

```html
<!-- wp:post-date /-->
```

Linked, custom format:

```html
<!-- wp:post-date {"format":"F j, Y","isLink":true} /-->
```

---

### wp:post-terms

Displays taxonomy terms (categories, tags). Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| term | string | — | Taxonomy slug: `"category"` or `"post_tag"` |
| separator | string | ", " | Separator between terms |
| prefix | string | "" | Text before terms |
| suffix | string | "" | Text after terms |

**Serialized markup:**

Categories:

```html
<!-- wp:post-terms {"term":"category"} /-->
```

Tags with prefix:

```html
<!-- wp:post-terms {"term":"post_tag","prefix":"Tags: "} /-->
```

---

### wp:post-content

Renders the full post content. Server-rendered — self-closing. Used in single post/page templates.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| tagName | string | — | Optional wrapper tag |

**Serialized markup:**

```html
<!-- wp:post-content {"layout":{"type":"constrained"}} /-->
```

---

### wp:post-author-name

Displays the author's name. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| isLink | boolean | false | Link to author archive |
| linkTarget | string | — | |

**Serialized markup:**

```html
<!-- wp:post-author-name {"isLink":true} /-->
```

---

### wp:post-navigation-link

Previous/next post navigation. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| type | string | — | `"previous"` or `"next"` |
| label | string | — | Custom link text |
| showTitle | boolean | false | Show post title in link |
| linkLabel | boolean | false | |
| arrow | string | — | `"none"`, `"arrow"`, `"chevron"` |
| taxonomy | string | — | Restrict to same taxonomy term |

**Serialized markup:**

```html
<!-- wp:post-navigation-link {"type":"previous","showTitle":true,"arrow":"arrow"} /-->
<!-- wp:post-navigation-link {"type":"next","showTitle":true,"arrow":"arrow"} /-->
```

---

### wp:query-pagination

Pagination wrapper. Paired block with inner blocks. Must be inside `wp:query`.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| paginationArrow | string | — | `"none"`, `"arrow"`, `"chevron"` |
| showLabel | boolean | true | |

**Serialized markup:**

```html
<!-- wp:query-pagination {"paginationArrow":"chevron","layout":{"type":"flex","justifyContent":"space-between"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
```

**Gotchas:**
- Saves `InnerBlocks.Content` — use paired format
- Children are self-closing: `wp:query-pagination-previous`, `wp:query-pagination-numbers`, `wp:query-pagination-next`
- `wp:query-pagination-next` and `wp:query-pagination-previous` accept an optional `"label"` attribute

---

### wp:query-no-results

Content shown when the query has no results. Paired block with inner blocks.

**Serialized markup:**

```html
<!-- wp:query-no-results -->
<!-- wp:paragraph -->
<p>Sorry, no posts matched your criteria.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
```

**Gotchas:**
- Saves `InnerBlocks.Content` — paired format
- Only renders when query returns zero results

---

### wp:query-title

Displays archive/search query title. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| type | string | — | `"archive"`, `"search"` |
| level | number | 1 | Heading level |
| showPrefix | boolean | true | Show "Search results for:" etc. |
| showSearchTerm | boolean | true | |

**Serialized markup:**

Archive page:

```html
<!-- wp:query-title {"type":"archive"} /-->
```

Search results:

```html
<!-- wp:query-title {"type":"search","level":1,"showPrefix":true} /-->
```

---

### wp:breadcrumbs

WordPress 7.0 breadcrumb trail block. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| prefersTaxonomy | boolean | false | Prefer taxonomy trail for applicable single content |
| separator | string | "/" | Separator rendered between items |
| showHomeItem | boolean | true | |
| showCurrentItem | boolean | true | |
| showOnHomePage | boolean | false | |

**Serialized markup:**

```html
<!-- wp:breadcrumbs /-->
```

Custom separator without current item:

```html
<!-- wp:breadcrumbs {"separator":"|","showCurrentItem":false} /-->
```

**Gotchas:**
- The saved content is self-closing; PHP renders the `<nav>`, ordered list, links, current item, and separator style.
- Breadcrumb output depends on query context (`postId`, `postType`, `templateSlug`) and current request.
- `separator` is stored as an attribute, not as hand-written list markup.

---

### wp:navigation

Navigation menu block. Can reference a saved `wp_navigation` post via `ref` (self-closing) or contain inline links (paired).

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| ref | number | — | `wp_navigation` post ID |
| overlayMenu | string | "mobile" | `"mobile"`, `"always"`, `"never"` |
| showSubmenuIcon | boolean | true | |
| submenuVisibility | string | "hover" | `"hover"`, `"click"`, `"always"` |
| hasIcon | boolean | true | Mobile toggle icon |
| icon | string | "handle" | Icon style |
| maxNestingLevel | number | 5 | |

**Serialized markup:**

Reference to saved navigation (most common in templates):

```html
<!-- wp:navigation {"ref":42} /-->
```

Inline navigation links:

```html
<!-- wp:navigation -->
<!-- wp:navigation-link {"label":"Home","url":"/","kind":"custom","isTopLevelLink":true} /-->
<!-- wp:navigation-link {"label":"About","url":"/about","kind":"custom","isTopLevelLink":true} /-->
<!-- wp:navigation-link {"label":"Blog","url":"/blog","kind":"custom","isTopLevelLink":true} /-->
<!-- wp:navigation-submenu {"label":"Services","url":"/services","kind":"custom"} -->
<!-- wp:navigation-link {"label":"Consulting","url":"/services/consulting","kind":"custom"} /-->
<!-- wp:navigation-link {"label":"Development","url":"/services/development","kind":"custom"} /-->
<!-- /wp:navigation-submenu -->
<!-- /wp:navigation -->
```

**Gotchas:**
- When `ref` is set, no inner blocks are saved — block returns `undefined` from save. Use self-closing format.
- When `ref` is NOT set, inner blocks are saved as `InnerBlocks.Content` — use paired format.
- Allowed inner blocks: `navigation-link`, `search`, `social-links`, `page-list`, `spacer`, `home-link`, `site-title`, `site-logo`, `navigation-submenu`, `loginout`, `buttons`
- `wp:navigation-link` uses `kind` for link type: `"custom"`, `"post-type"`, `"taxonomy"`
- `wp:navigation-submenu` is a paired block containing nested `wp:navigation-link` blocks

---

### wp:navigation-link

A single navigation menu link. Self-closing. Must be inside `wp:navigation` or `wp:navigation-submenu`.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| label | string | — | Display text |
| url | string | — | Link URL |
| kind | string | — | `"custom"`, `"post-type"`, `"taxonomy"` |
| type | string | — | Post type or taxonomy slug |
| id | number | — | Post/term ID for dynamic links |
| opensInNewTab | boolean | false | |
| title | string | — | Title attribute |
| rel | string | — | |
| isTopLevelLink | boolean | — | |

**Serialized markup:**

```html
<!-- wp:navigation-link {"label":"Contact","url":"/contact","kind":"custom","isTopLevelLink":true} /-->
```

Link to a specific page by ID:

```html
<!-- wp:navigation-link {"label":"About Us","type":"page","id":42,"url":"/about-us","kind":"post-type"} /-->
```

---

### wp:navigation-overlay-close

WordPress 7.0 close button for customizable navigation overlays. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| displayMode | string | "icon" | `"icon"`, `"text"`, or `"both"` |
| text | string | "Close" | Used when displayMode includes text |

**Serialized markup:**

```html
<!-- wp:navigation-overlay-close /-->
```

With text and icon:

```html
<!-- wp:navigation-overlay-close {"displayMode":"both","text":"Close menu"} /-->
```

**Gotchas:**
- The saved post content is self-closing; PHP renders the `<button>`, close icon, optional text span, and wrapper attributes.
- Use inside navigation overlay templates or patterns. Do not hand-author the rendered button HTML inside the block.

---

### wp:social-links

Container for social media icon links. Paired block with inner blocks.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| iconColor | string | — | Named color slug |
| iconBackgroundColor | string | — | Named color slug |
| openInNewTab | boolean | false | |
| showLabels | boolean | false | |
| size | string | — | `"has-small-icon-size"`, `"has-normal-icon-size"`, `"has-large-icon-size"`, `"has-huge-icon-size"` |

### wp:social-link

A single social icon. Self-closing. Must be inside `wp:social-links`.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| url | string | — | Profile URL |
| service | string | — | Service name (see list below) |
| label | string | — | Accessible label |
| rel | string | — | |

**Services:** `amazon`, `bandcamp`, `behance`, `bluesky`, `chain`, `codepen`, `deviantart`, `dribbble`, `dropbox`, `etsy`, `facebook`, `feed`, `fivehundredpx`, `flickr`, `foursquare`, `github`, `goodreads`, `google`, `gravatar`, `instagram`, `lastfm`, `linkedin`, `mail`, `mastodon`, `meetup`, `medium`, `patreon`, `phone`, `pinterest`, `pocket`, `reddit`, `skype`, `snapchat`, `soundcloud`, `spotify`, `telegram`, `threads`, `tiktok`, `tumblr`, `twitch`, `twitter`, `vimeo`, `vk`, `whatsapp`, `wordpress`, `x`, `yelp`, `youtube`

**Serialized markup:**

```html
<!-- wp:social-links {"iconColor":"white","iconBackgroundColor":"black","openInNewTab":true,"className":"is-style-default"} -->
<ul class="wp-block-social-links has-icon-color has-icon-background-color is-style-default">
<!-- wp:social-link {"url":"https://twitter.com/example","service":"twitter"} /-->
<!-- wp:social-link {"url":"https://github.com/example","service":"github"} /-->
<!-- wp:social-link {"url":"https://linkedin.com/in/example","service":"linkedin"} /-->
<!-- wp:social-link {"url":"mailto:hello@example.com","service":"mail"} /-->
</ul>
<!-- /wp:social-links -->
```

**Gotchas:**
- `wp:social-links` renders a `<ul>` wrapper — it's a paired block
- `wp:social-link` children are self-closing
- Color attributes: `iconColor`/`iconBackgroundColor` are named slugs; `customIconColor`/`customIconBackgroundColor` for hex values
- Styles: `default` (with background), `logos-only`, `pill-shape`

---

### wp:site-title

Displays the site title. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| level | number | 1 | Heading level (0 = `<p>`) |
| isLink | boolean | true | Link to home |
| linkTarget | string | — | |

**Serialized markup:**

```html
<!-- wp:site-title /-->
```

As non-linked paragraph:

```html
<!-- wp:site-title {"level":0,"isLink":false} /-->
```

---

### wp:site-tagline

Displays the site tagline/description. Server-rendered — self-closing.

**Serialized markup:**

```html
<!-- wp:site-tagline /-->
```

---

### wp:site-logo

Displays the site logo. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| width | number | — | Logo width in px |
| isLink | boolean | true | Link to home |
| linkTarget | string | — | |
| shouldSyncIcon | boolean | — | Sync with site icon |

**Serialized markup:**

```html
<!-- wp:site-logo {"width":200} /-->
```

---

### wp:search

Search form block. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| label | string | — | Form label text |
| showLabel | boolean | true | |
| placeholder | string | "" | Input placeholder |
| buttonText | string | — | Submit button text |
| buttonPosition | string | "button-outside" | `"button-outside"`, `"button-inside"`, `"no-button"`, `"button-only"` |
| buttonUseIcon | boolean | false | Icon instead of text |
| width | number | — | Input width |
| widthUnit | string | — | Width unit |

**Serialized markup:**

```html
<!-- wp:search {"label":"Search","buttonText":"Search"} /-->
```

Icon button, no label:

```html
<!-- wp:search {"showLabel":false,"placeholder":"Search...","buttonText":"Search","buttonUseIcon":true} /-->
```

---

### wp:comments

Comments section container. Paired block with inner blocks for the comment structure.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| tagName | string | "div" | |
| legacy | boolean | false | Use legacy comments template |

**Serialized markup:**

```html
<!-- wp:comments -->
<div class="wp-block-comments">
<!-- wp:comments-title {"level":2} /-->

<!-- wp:comment-template -->
<!-- wp:columns -->
<div class="wp-block-columns">
<!-- wp:column {"width":"40px"} -->
<div class="wp-block-column" style="flex-basis:40px">
<!-- wp:avatar {"size":40} /-->
</div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:comment-author-name /-->
<!-- wp:comment-date {"format":"F j, Y"} /-->
<!-- wp:comment-content /-->
<!-- wp:comment-reply-link /-->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->
<!-- /wp:comment-template -->

<!-- wp:comments-pagination -->
<!-- wp:comments-pagination-previous /-->
<!-- wp:comments-pagination-numbers /-->
<!-- wp:comments-pagination-next /-->
<!-- /wp:comments-pagination -->

<!-- wp:post-comments-form /-->
</div>
<!-- /wp:comments -->
```

**Gotchas:**
- `wp:comments` renders inner blocks — paired format with `<div>` wrapper
- `wp:comment-template` iterates over each comment — paired format
- Inside `wp:comment-template`, use self-closing blocks: `wp:avatar`, `wp:comment-author-name`, `wp:comment-date`, `wp:comment-content`, `wp:comment-reply-link`, `wp:comment-edit-link`
- `wp:comments-title` is self-closing with optional `level` (number)
- `wp:comments-pagination` is a paired block like `wp:query-pagination`
- `wp:post-comments-form` is self-closing

---

### wp:comments-title

Displays the "X Comments" heading. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| showPostTitle | boolean | — | Include post title |
| showCommentsCount | boolean | — | |
| level | number | 2 | Heading level |

---

### wp:avatar

Displays a user avatar. Server-rendered — self-closing. Used in comment templates and author blocks.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| userId | number | — | User ID |
| size | number | 96 | Avatar size in px |
| isLink | boolean | false | |
| linkTarget | string | — | |

**Serialized markup:**

```html
<!-- wp:avatar {"size":40} /-->
```

---

### wp:comment-author-name, wp:comment-date, wp:comment-content, wp:comment-reply-link, wp:comment-edit-link

Comment detail blocks. All server-rendered — self-closing.

```html
<!-- wp:comment-author-name {"isLink":true} /-->
<!-- wp:comment-date {"format":"F j, Y \\a\\t g:i a"} /-->
<!-- wp:comment-content /-->
<!-- wp:comment-reply-link /-->
<!-- wp:comment-edit-link /-->
```

---

### wp:post-comments-form

Displays the comment submission form. Server-rendered — self-closing.

```html
<!-- wp:post-comments-form /-->
```

---

### wp:latest-posts

Displays recent posts. Server-rendered — self-closing.

**Key Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| postsToShow | number | 5 | |
| displayPostContent | boolean | false | |
| displayPostContentRadio | string | "excerpt" | `"excerpt"` or `"full_post"` |
| excerptLength | number | 55 | |
| displayAuthor | boolean | false | |
| displayPostDate | boolean | false | |
| displayFeaturedImage | boolean | false | |
| featuredImageAlign | string | — | `"left"`, `"center"`, `"right"` |
| featuredImageSizeSlug | string | "thumbnail" | |
| columns | number | 3 | For grid layout |
| postLayout | string | "list" | `"list"` or `"grid"` |
| order | string | "desc" | |
| orderBy | string | "date" | |
| categories | array | — | Category filter |

**Serialized markup:**

```html
<!-- wp:latest-posts {"postsToShow":3,"displayPostDate":true,"displayFeaturedImage":true,"featuredImageSizeSlug":"medium","postLayout":"grid","columns":3} /-->
```

---

### wp:categories

Displays taxonomy categories. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| taxonomy | string | — | Taxonomy slug |
| displayAsDropdown | boolean | false | |
| showHierarchy | boolean | false | |
| showPostCounts | boolean | false | |
| showOnlyTopLevel | boolean | false | |
| showEmpty | boolean | false | |

**Serialized markup:**

```html
<!-- wp:categories {"showPostCounts":true,"showHierarchy":true} /-->
```

---

### wp:archives

Archive links. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| displayAsDropdown | boolean | false | |
| showLabel | boolean | true | |
| showPostCounts | boolean | false | |
| type | string | — | `"monthly"`, `"yearly"`, `"weekly"`, `"daily"` |

**Serialized markup:**

```html
<!-- wp:archives {"showPostCounts":true} /-->
```

---

### wp:tag-cloud

Tag cloud widget. Server-rendered — self-closing.

```html
<!-- wp:tag-cloud {"numberOfTags":30,"showTagCounts":true} /-->
```

---

### wp:rss

RSS feed display. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| feedURL | string | — | RSS feed URL |
| itemsToShow | number | 5 | |
| displayExcerpt | boolean | false | |
| displayAuthor | boolean | false | |
| displayDate | boolean | false | |
| columns | number | — | |
| blockLayout | string | "list" | `"list"` or `"grid"` |

**Serialized markup:**

```html
<!-- wp:rss {"feedURL":"https://example.com/feed","itemsToShow":5,"displayDate":true,"displayExcerpt":true} /-->
```

---

### wp:loginout

Login/logout link. Server-rendered — self-closing.

```html
<!-- wp:loginout {"displayLoginAsForm":false,"redirectToCurrent":true} /-->
```

---

### wp:page-list

Auto-generated page navigation. Server-rendered — self-closing.

```html
<!-- wp:page-list /-->
```

---

### wp:icon

WordPress 7.0 registered SVG icon block. Server-rendered — self-closing.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| icon | string | — | Registered icon name |
| ariaLabel | string | — | Accessible label; omit for decorative icons |

**Serialized markup:**

```html
<!-- wp:icon {"icon":"wordpress"} /-->
```

With an accessible label and custom size/color:

```html
<!-- wp:icon {"icon":"wordpress","ariaLabel":"WordPress","style":{"color":{"text":"#3858e9"},"dimensions":{"width":"32px"}}} /-->
```

**Gotchas:**
- The icon must exist in the WordPress icon registry or render output is empty.
- The saved block is self-closing; PHP injects the `<svg>` and wrapper `<div>`.
- For decorative icons, omit `ariaLabel`; WordPress renders the SVG with `aria-hidden="true"`.

---

## 6. Remaining Static Blocks (with save.js)

### wp:accordion

Accordion container introduced in WordPress 7.0. Paired block with `wp:accordion-item` children.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| iconPosition | string | "right" | `"left"` or `"right"` |
| showIcon | boolean | true | |
| autoclose | boolean | false | Close other items when one opens |
| headingLevel | number | 3 | Default heading level passed to headings |

**Serialized markup:**

```html
<!-- wp:accordion -->
<div class="wp-block-accordion" role="group">
<!-- wp:accordion-item -->
<div class="wp-block-accordion-item">
<!-- wp:accordion-heading {"title":"What is included?"} -->
<h3 class="wp-block-accordion-heading"><button type="button" class="wp-block-accordion-heading__toggle"><span class="wp-block-accordion-heading__toggle-title">What is included?</span><span class="wp-block-accordion-heading__toggle-icon" aria-hidden="true">+</span></button></h3>
<!-- /wp:accordion-heading -->
<!-- wp:accordion-panel -->
<div class="wp-block-accordion-panel" role="region">
<!-- wp:paragraph -->
<p>Everything needed to publish valid block content.</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:accordion-panel -->
</div>
<!-- /wp:accordion-item -->
</div>
<!-- /wp:accordion -->
```

**Gotchas:**
- `wp:accordion` only allows `wp:accordion-item`.
- `wp:accordion-item` only allows `wp:accordion-heading` and `wp:accordion-panel`.
- `wp:accordion-heading` saves a heading tag containing a `<button>`; do not replace it with a plain `wp:heading`.
- Open items add `is-open` to the `wp:accordion-item` wrapper and use `"openByDefault":true`.

---

### wp:tabs

Experimental tabbed interface in WordPress 7.0. Prefer editor-generated markup when possible.

**Serialized markup:**

```html
<!-- wp:tabs {"activeTabIndex":0} -->
<div class="wp-block-tabs">
<!-- wp:tabs-menu -->
<div class="wp-block-tabs-menu" role="tablist">
<!-- wp:tabs-menu-item -->
<button class="wp-block-tabs-menu-item wp-block-tabs-menu-item__template" type="button" role="tab"></button>
<!-- /wp:tabs-menu-item -->
</div>
<!-- /wp:tabs-menu -->
<!-- wp:tab-panel -->
<div class="wp-block-tab-panel">
<!-- wp:tab {"label":"Overview"} -->
<section class="wp-block-tab" role="tabpanel">
<!-- wp:paragraph -->
<p>Overview tab content.</p>
<!-- /wp:paragraph -->
</section>
<!-- /wp:tab -->
</div>
<!-- /wp:tab-panel -->
</div>
<!-- /wp:tabs -->
```

**Gotchas:**
- `wp:tabs` accepts `wp:tabs-menu` and `wp:tab-panel`.
- `wp:tabs-menu` accepts only `wp:tabs-menu-item`.
- `wp:tab-panel` accepts only `wp:tab`.
- `wp:tabs-menu-item` saves an empty template button; PHP/interactivity fills labels and state at render time.
- This block family is marked experimental in WordPress 7.0; avoid for long-lived hand-authored content unless the project has accepted that risk.

---

### wp:audio

Audio player block.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| src | string | — | Audio file URL |
| caption | rich-text | — | |
| id | number | — | Attachment ID |
| autoplay | boolean | — | |
| loop | boolean | — | |
| preload | string | — | `"none"`, `"metadata"`, `"auto"` |

**Serialized markup:**

```html
<!-- wp:audio {"id":50} -->
<figure class="wp-block-audio"><audio controls src="https://example.com/podcast.mp3"></audio></figure>
<!-- /wp:audio -->
```

With caption:

```html
<!-- wp:audio {"id":50} -->
<figure class="wp-block-audio"><audio controls src="https://example.com/podcast.mp3"></audio><figcaption class="wp-element-caption">Episode 12: The Future of Web Development</figcaption></figure>
<!-- /wp:audio -->
```

---

### wp:video

Video player block.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| src | string | — | Video file URL |
| caption | rich-text | — | |
| id | number | — | |
| autoplay | boolean | — | |
| controls | boolean | true | |
| loop | boolean | — | |
| muted | boolean | — | |
| poster | string | — | Poster image URL |
| preload | string | "metadata" | |
| playsInline | boolean | — | |

**Serialized markup:**

```html
<!-- wp:video {"id":60} -->
<figure class="wp-block-video"><video controls src="https://example.com/video.mp4"></video></figure>
<!-- /wp:video -->
```

With poster and autoplay:

```html
<!-- wp:video {"id":60,"autoplay":true,"loop":true,"muted":true} -->
<figure class="wp-block-video"><video autoplay controls loop muted src="https://example.com/bg-video.mp4"></video></figure>
<!-- /wp:video -->
```

---

### wp:file

File download block.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| href | string | — | File URL |
| fileName | rich-text | — | Display name |
| textLinkHref | string | — | Text link URL |
| textLinkTarget | string | — | |
| showDownloadButton | boolean | true | |
| downloadButtonText | string | — | |
| displayPreview | boolean | false | |
| previewHeight | number | 600 | PDF preview height |
| id | number | — | |

**Serialized markup:**

```html
<!-- wp:file {"id":70,"href":"https://example.com/report.pdf"} -->
<div class="wp-block-file"><a id="wp-block-file--media-70" href="https://example.com/report.pdf">Annual Report 2025</a><a href="https://example.com/report.pdf" class="wp-block-file__button wp-element-button" download aria-describedby="wp-block-file--media-70">Download</a></div>
<!-- /wp:file -->
```

**Gotchas:**
- The text link `<a>` gets `id="wp-block-file--media-{id}"` where `{id}` is the attachment ID
- The download button `<a>` MUST have `aria-describedby="wp-block-file--media-{id}"` matching the text link's `id` — missing this causes block recovery
- Download button classes: `wp-block-file__button wp-element-button`
- The `download` attribute (no value) is required on the button `<a>`

---

### wp:verse

Preformatted poetry/verse block. Identical structure to `wp:preformatted`.

**Serialized markup:**

```html
<!-- wp:verse -->
<pre class="wp-block-verse">Two roads diverged in a yellow wood,
And sorry I could not travel both
And be one traveler, long I stood
And looked down one as far as I could
To where it bent in the undergrowth;</pre>
<!-- /wp:verse -->
```

---

### wp:more

"Read More" separator. Outputs `<!--more-->` WordPress comment.

**Attributes:**

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| customText | string | — | Custom "more" text |
| noTeaser | boolean | false | Hide content before more tag |

**Serialized markup:**

```html
<!-- wp:more -->
<!--more-->
<!-- /wp:more -->
```

With custom text:

```html
<!-- wp:more {"customText":"Continue reading"} -->
<!--more Continue reading-->
<!-- /wp:more -->
```

**Gotchas:**
- Output is a raw HTML comment `<!--more-->`, NOT a visible element
- No wrapper class or element
- Paired block format despite minimal output

---

### wp:nextpage

Page break for multi-page posts.

**Serialized markup:**

```html
<!-- wp:nextpage -->
<!--nextpage-->
<!-- /wp:nextpage -->
```

---

## 7. Template Patterns

Complete working examples for common block theme templates.

### Single Post Template

```html
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
<!-- wp:post-featured-image {"aspectRatio":"16/9","align":"wide"} /-->

<!-- wp:group {"layout":{"type":"constrained","contentSize":"650px"}} -->
<div class="wp-block-group">
<!-- wp:post-title {"level":1} /-->

<!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"},"style":{"spacing":{"blockGap":"1em"}}} -->
<div class="wp-block-group">
<!-- wp:post-date {"format":"F j, Y"} /-->
<!-- wp:paragraph -->
<p>·</p>
<!-- /wp:paragraph -->
<!-- wp:post-author-name {"isLink":true} /-->
<!-- wp:paragraph -->
<p>·</p>
<!-- /wp:paragraph -->
<!-- wp:post-terms {"term":"category"} /-->
</div>
<!-- /wp:group -->

<!-- wp:post-content {"layout":{"type":"constrained"}} /-->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:post-terms {"term":"post_tag","prefix":"Tags: "} /-->

<!-- wp:group {"layout":{"type":"flex","justifyContent":"space-between"}} -->
<div class="wp-block-group">
<!-- wp:post-navigation-link {"type":"previous","showTitle":true,"arrow":"arrow"} /-->
<!-- wp:post-navigation-link {"type":"next","showTitle":true,"arrow":"arrow"} /-->
</div>
<!-- /wp:group -->

<!-- wp:comments -->
<div class="wp-block-comments">
<!-- wp:comments-title /-->
<!-- wp:comment-template -->
<!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap","verticalAlignment":"top"},"style":{"spacing":{"blockGap":"1em"}}} -->
<div class="wp-block-group">
<!-- wp:avatar {"size":40} /-->
<!-- wp:group {"layout":{"type":"flex","orientation":"vertical","spacing":{"blockGap":"0.5em"}}} -->
<div class="wp-block-group">
<!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group">
<!-- wp:comment-author-name /-->
<!-- wp:comment-date {"format":"M j, Y"} /-->
</div>
<!-- /wp:group -->
<!-- wp:comment-content /-->
<!-- wp:comment-reply-link /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:comment-template -->
<!-- wp:comments-pagination -->
<!-- wp:comments-pagination-previous /-->
<!-- wp:comments-pagination-numbers /-->
<!-- wp:comments-pagination-next /-->
<!-- /wp:comments-pagination -->
<!-- wp:post-comments-form /-->
</div>
<!-- /wp:comments -->
</div>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
```

### Archive / Blog Index Template

```html
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
<!-- wp:query-title {"type":"archive"} /-->

<!-- wp:query {"queryId":1,"query":{"perPage":10,"postType":"post","order":"desc","orderBy":"date","inherit":true}} -->
<div class="wp-block-query">
<!-- wp:post-template {"layout":{"type":"default"}} -->
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9"} /-->
<!-- wp:post-title {"isLink":true,"level":2} /-->
<!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group">
<!-- wp:post-date /-->
<!-- wp:post-author-name {"isLink":true} /-->
<!-- wp:post-terms {"term":"category"} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-excerpt {"excerptLength":30,"moreText":"Read more"} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->

<!-- wp:query-pagination {"layout":{"type":"flex","justifyContent":"space-between"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->

<!-- wp:query-no-results -->
<!-- wp:paragraph -->
<p>No posts found.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
</main>
<!-- /wp:group -->
```

### Search Results Template

```html
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
<!-- wp:query-title {"type":"search","level":1} /-->

<!-- wp:query {"queryId":1,"query":{"perPage":10,"postType":"post","inherit":true}} -->
<div class="wp-block-query">
<!-- wp:post-template -->
<!-- wp:post-title {"isLink":true,"level":2} /-->
<!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group">
<!-- wp:post-date /-->
<!-- wp:post-terms {"term":"category"} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-excerpt {"excerptLength":25} /-->
<!-- /wp:post-template -->

<!-- wp:query-pagination -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->

<!-- wp:query-no-results -->
<!-- wp:paragraph -->
<p>No results found. Please try a different search term.</p>
<!-- /wp:paragraph -->
<!-- wp:search {"label":"Search","buttonText":"Search"} /-->
<!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
</main>
<!-- /wp:group -->
```

### 404 Template

```html
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"},"style":{"spacing":{"padding":{"top":"4em","bottom":"4em"}}}} -->
<main class="wp-block-group" style="padding-top:4em;padding-bottom:4em">
<!-- wp:heading {"level":1,"style":{"typography":{"textAlign":"center"}}} -->
<h1 class="wp-block-heading has-text-align-center">Page Not Found</h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"style":{"typography":{"textAlign":"center"}}} -->
<p class="has-text-align-center">The page you are looking for does not exist. It may have been moved or deleted.</p>
<!-- /wp:paragraph -->

<!-- wp:search {"label":"Search","placeholder":"Search this site...","buttonText":"Search","width":50,"widthUnit":"%","align":"center"} /-->
</main>
<!-- /wp:group -->
```

### Header Template Part

```html
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
<!-- wp:group {"layout":{"type":"flex","justifyContent":"space-between","flexWrap":"wrap"}} -->
<div class="wp-block-group">
<!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group">
<!-- wp:site-logo {"width":50} /-->
<!-- wp:group {"layout":{"type":"flex","orientation":"vertical","spacing":{"blockGap":"0"}}} -->
<div class="wp-block-group">
<!-- wp:site-title {"level":0} /-->
<!-- wp:site-tagline /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->

<!-- wp:navigation {"ref":42,"overlayMenu":"mobile"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
```

### Footer Template Part

```html
<!-- wp:group {"backgroundColor":"black","textColor":"white","layout":{"type":"constrained"},"style":{"spacing":{"padding":{"top":"3em","bottom":"3em"}}}} -->
<div class="wp-block-group has-white-color has-black-background-color has-text-color has-background" style="padding-top:3em;padding-bottom:3em">
<!-- wp:columns -->
<div class="wp-block-columns">
<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">About</h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>A short description of your site and what visitors can find here.</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Quick Links</h3>
<!-- /wp:heading -->
<!-- wp:page-list /-->
</div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Connect</h3>
<!-- /wp:heading -->
<!-- wp:social-links {"iconColor":"white","className":"is-style-logos-only"} -->
<ul class="wp-block-social-links has-icon-color is-style-logos-only">
<!-- wp:social-link {"url":"https://twitter.com/example","service":"twitter"} /-->
<!-- wp:social-link {"url":"https://github.com/example","service":"github"} /-->
<!-- wp:social-link {"url":"https://linkedin.com/company/example","service":"linkedin"} /-->
</ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:paragraph {"fontSize":"small","style":{"typography":{"textAlign":"center"}}} -->
<p class="has-text-align-center has-small-font-size">© 2025 Your Site Name. All rights reserved.</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
```

### Page Template (Full Width with Sidebar)

```html
<!-- wp:group {"tagName":"main","layout":{"type":"constrained","contentSize":"1200px"}} -->
<main class="wp-block-group">
<!-- wp:columns -->
<div class="wp-block-columns">
<!-- wp:column {"width":"66.66%"} -->
<div class="wp-block-column" style="flex-basis:66.66%">
<!-- wp:post-title {"level":1} /-->
<!-- wp:post-content {"layout":{"type":"constrained"}} /-->
</div>
<!-- /wp:column -->

<!-- wp:column {"width":"33.33%"} -->
<div class="wp-block-column" style="flex-basis:33.33%">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Recent Posts</h3>
<!-- /wp:heading -->
<!-- wp:latest-posts {"postsToShow":5,"displayPostDate":true} /-->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Categories</h3>
<!-- /wp:heading -->
<!-- wp:categories {"showPostCounts":true} /-->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Search</h3>
<!-- /wp:heading -->
<!-- wp:search {"label":"Search","buttonText":"Go"} /-->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->
</main>
<!-- /wp:group -->
```

---

## 8. WordPress VIP Constraints

When generating content for WordPress VIP environments:

### Block Compatibility
- Stick to core blocks. Third-party block plugins may not be available on VIP unless explicitly added to the project.
- `wp:html` blocks work but avoid inline `<script>` tags — VIP CSP policies may block them.
- `wp:shortcode` depends on the shortcode being registered in the VIP application. Verify availability before using.
- `wp:embed` works for allowlisted oEmbed providers. Custom embed URLs may be blocked.

### Performance
- Avoid deeply nested groups (more than 3-4 levels). Each nesting level adds DOM elements and increases parse time.
- Prefer `wp:columns` over nested `wp:group` blocks for layouts — columns are purpose-built for grid layouts.
- Minimize inline styles where possible. Use named colors and font size presets (`"fontSize":"large"`, `"backgroundColor":"pale-pink"`) instead of custom values — these map to CSS custom properties and are more cacheable.
- Large pages with 100+ blocks: consider breaking content into reusable patterns (`wp:pattern`) to improve editor performance.

### Content Restrictions
- Images should reference media uploaded to the VIP media library. External image URLs work but bypass VIP's image optimization CDN.
- File blocks (`wp:file`) are limited to VIP-allowed file types.
- Keep `wp:table` blocks under 100 rows for editor performance. For larger datasets, use a shortcode or custom block backed by a REST API.

### Block Validation
- VIP environments use the same Gutenberg validation as standard WordPress — all serialization rules in this document apply.
- VIP Go sites may run newer Gutenberg plugin versions than WordPress core includes. Check the site's Gutenberg version if using recently-added blocks or attributes.
- Content imported via WP-CLI or REST API still runs through block validation when edited in the block editor.

---

## 9. Quick Reference: Parent/Child Constraints

| Child Block | Required Parent |
|-------------|----------------|
| `wp:column` | `wp:columns` |
| `wp:list-item` | `wp:list` |
| `wp:button` | `wp:buttons` |
| `wp:navigation-link` | `wp:navigation` |
| `wp:navigation-submenu` | `wp:navigation` |
| `wp:page-list-item` | `wp:page-list` |
| `wp:social-link` | `wp:social-links` |
| `wp:comment-*` | Various comment parent blocks |
| `wp:query-pagination-*` | `wp:query-pagination` |
| `wp:comments-pagination-*` | `wp:comments-pagination` |
| `wp:accordion-item` | `wp:accordion` |
| `wp:accordion-heading` | `wp:accordion-item` |
| `wp:accordion-panel` | `wp:accordion-item` |
| `wp:tabs-menu` | `wp:tabs` |
| `wp:tabs-menu-item` | `wp:tabs-menu` |
| `wp:tab-panel` | `wp:tabs` |
| `wp:tab` | `wp:tab-panel` |
| `wp:form-input` | `wp:form` |
| `wp:form-submit-button` | `wp:form` |
| `wp:form-submission-notification` | `wp:form` |
| `wp:term-template` | `wp:terms-query` |
| `wp:term-name` | `wp:term-template` |
| `wp:term-count` | `wp:term-template` |
| `wp:term-description` | `wp:term-template` |

## 10. Quick Reference: Container Blocks (Accept Inner Blocks)

| Block | Allowed Children |
|-------|-----------------|
| `wp:group` | Any block |
| `wp:columns` | `wp:column` only |
| `wp:column` | Any block |
| `wp:cover` | Any block |
| `wp:buttons` | `wp:button` primarily |
| `wp:quote` | Any block (typically paragraphs) |
| `wp:list` | `wp:list-item` only |
| `wp:list-item` | `wp:list` (for nesting) |
| `wp:media-text` | Any block (in content area) |
| `wp:details` | Any block |
| `wp:gallery` | `wp:image` primarily |
| `wp:navigation` | `wp:navigation-link`, `wp:navigation-submenu`, `wp:page-list`, `wp:search`, `wp:social-links`, `wp:site-logo`, `wp:site-title`, `wp:spacer`, `wp:buttons`, `wp:loginout` |
| `wp:navigation-submenu` | `wp:navigation-link`, `wp:navigation-submenu`, `wp:page-list` |
| `wp:social-links` | `wp:social-link` |
| `wp:query` | `wp:post-template`, `wp:query-pagination`, `wp:query-no-results` and any block |
| `wp:post-template` | Any block (iterates over posts) |
| `wp:query-pagination` | `wp:query-pagination-previous`, `wp:query-pagination-numbers`, `wp:query-pagination-next` |
| `wp:query-no-results` | Any block |
| `wp:comments` | `wp:comments-title`, `wp:comment-template`, `wp:comments-pagination`, `wp:post-comments-form` |
| `wp:comment-template` | Any block (iterates over comments) |
| `wp:comments-pagination` | `wp:comments-pagination-previous`, `wp:comments-pagination-numbers`, `wp:comments-pagination-next` |
| `wp:accordion` | `wp:accordion-item` |
| `wp:accordion-item` | `wp:accordion-heading`, `wp:accordion-panel` |
| `wp:accordion-panel` | Any block |
| `wp:tabs` | `wp:tabs-menu`, `wp:tab-panel` |
| `wp:tabs-menu` | `wp:tabs-menu-item` |
| `wp:tab-panel` | `wp:tab` |
| `wp:tab` | Any block |
| `wp:form` | `wp:paragraph`, `wp:heading`, `wp:form-input`, `wp:form-submit-button`, `wp:form-submission-notification`, `wp:group`, `wp:columns` |
| `wp:form-submit-button` | `wp:buttons`, `wp:button` |
| `wp:terms-query` | `wp:term-template` and surrounding blocks |
| `wp:term-template` | Any block, typically `wp:term-name`, `wp:term-count`, `wp:term-description` |

## 11. Quick Reference: Self-Closing vs Paired Blocks

**Self-closing** (use `<!-- wp:name /-->`):
- `wp:pattern`, `wp:template-part`
- Server-rendered leaf blocks: `wp:breadcrumbs`, `wp:icon`, `wp:navigation-overlay-close`, `wp:home-link`, `wp:post-title`, `wp:post-featured-image`, `wp:post-excerpt`, `wp:post-date`, `wp:post-terms`, `wp:post-content`, `wp:post-author`, `wp:post-author-biography`, `wp:post-author-name`, `wp:post-comment`, `wp:post-comments-count`, `wp:post-comments-link`, `wp:post-navigation-link`, `wp:post-time-to-read`, `wp:post-comments-form`
- `wp:query-title`, `wp:query-total`, `wp:query-pagination-previous`, `wp:query-pagination-numbers`, `wp:query-pagination-next`
- `wp:comments-title`, `wp:avatar`, `wp:comment-author-avatar`, `wp:comment-author-name`, `wp:comment-date`, `wp:comment-content`, `wp:comment-reply-link`, `wp:comment-edit-link`, `wp:comments-pagination-previous`, `wp:comments-pagination-numbers`, `wp:comments-pagination-next`
- `wp:site-title`, `wp:site-tagline`, `wp:site-logo`, `wp:search`, `wp:loginout`, `wp:page-list`, `wp:page-list-item`
- `wp:navigation` (only when `ref` is set), `wp:navigation-link`, `wp:social-link`
- `wp:latest-posts`, `wp:latest-comments`, `wp:categories`, `wp:archives`, `wp:tag-cloud`, `wp:rss`, `wp:calendar`
- `wp:block`, `wp:footnotes`, `wp:math`, `wp:read-more`, `wp:table-of-contents`, `wp:term-count`, `wp:term-description`, `wp:term-name`

**Paired with inner blocks** (server-rendered containers):
- `wp:query`, `wp:post-template`, `wp:query-pagination`, `wp:query-no-results`
- `wp:terms-query`, `wp:term-template`
- `wp:navigation` (when `ref` is NOT set), `wp:navigation-submenu`
- `wp:comments`, `wp:comment-template`, `wp:comments-pagination`
- `wp:social-links`

**Paired with HTML content** (static blocks with save.js):
- All blocks that save HTML content: paragraph, heading, image, group, columns, column, cover, button, buttons, list, list-item, quote, pullquote, separator, media-text, table, html, shortcode, code, preformatted, verse, embed, gallery, spacer, details, file, audio, video, more, nextpage, accordion, accordion-item, accordion-heading, accordion-panel, tabs, tabs-menu, tabs-menu-item, tab-panel, tab, form, form-input, form-submit-button, form-submission-notification, text-columns

## 12. Common Default Color Slugs

These are the standard WordPress color palette slugs available in most themes:

`black`, `cyan-bluish-gray`, `white`, `pale-pink`, `vivid-red`, `luminous-vivid-orange`, `luminous-vivid-amber`, `light-green-cyan`, `vivid-green-cyan`, `pale-cyan-blue`, `vivid-cyan-blue`, `vivid-purple`

Usage: `"backgroundColor":"pale-cyan-blue"` -> class `has-pale-cyan-blue-background-color has-background`

## 13. Layout Types for wp:group

| Layout Type | JSON | Behavior |
|-------------|------|----------|
| Flow (default) | `{"type":"default"}` or `{"type":"flow"}` | Block flow, full width |
| Constrained | `{"type":"constrained"}` | Centered with max-width |
| Flex Row | `{"type":"flex","flexWrap":"nowrap"}` | Horizontal flex layout |
| Flex Column/Stack | `{"type":"flex","orientation":"vertical"}` | Vertical flex layout |
| Grid | `{"type":"grid"}` | CSS grid layout |
