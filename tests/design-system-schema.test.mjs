import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";

const schema = JSON.parse(
  readFileSync(new URL("../schemas/design-system.schema.json", import.meta.url))
);
const example = JSON.parse(
  readFileSync(
    new URL("../examples/agency-site/input/design-system.json", import.meta.url)
  )
);

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

// Deep clone the example, mutate one field, and return the mutated copy.
// Every negative test starts from a document that is known to validate, so a
// failure can only come from the field under test.
function withChange(mutate) {
  const doc = structuredClone(example);
  mutate(doc);
  return doc;
}

function errorsFor(doc) {
  validate(doc);
  return (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

test("the worked example validates", () => {
  const ok = validate(example);
  assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
});

test("a self-hosted width-axis font may declare its fontStretch range", () => {
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
  assert.equal(validate(doc), true, JSON.stringify(validate.errors, null, 2));
});

test("a raw hex button background is rejected", () => {
  const doc = withChange((d) => {
    d.elements.button.background = "#1f6feb";
  });
  assert.equal(validate(doc), false);
  assert.match(errorsFor(doc).join("\n"), /elements\/button\/background/);
});

test("a raw hex hover colour is rejected", () => {
  const doc = withChange((d) => {
    d.elements.button.hover.background = "#0d419d";
  });
  assert.equal(validate(doc), false);
});

test("a raw hex card background is rejected", () => {
  const doc = withChange((d) => {
    d.styles.card.background = "#ffffff";
  });
  assert.equal(validate(doc), false);
});

test("palette entries still carry real hex values", () => {
  const doc = withChange((d) => {
    d.palette[0].color = "surface";
  });
  assert.equal(validate(doc), false);
});

test("an unknown font size slug is rejected", () => {
  const doc = withChange((d) => {
    d.typography.fontSizes[0].slug = "jumbo";
  });
  assert.equal(validate(doc), false);
});

test("a missing required section is rejected", () => {
  const doc = withChange((d) => {
    delete d.layout;
  });
  assert.equal(validate(doc), false);
});

test("an unknown top level key is rejected", () => {
  const doc = withChange((d) => {
    d.animations = { hero: "fade-in" };
  });
  assert.equal(validate(doc), false);
});

test("sectionRhythm must reference spacing slugs, not raw sizes", () => {
  const doc = withChange((d) => {
    d.styles.sectionRhythm.default = "64px";
  });
  assert.equal(validate(doc), false);
});

test("layout.rootPadding accepts a css length", () => {
  const doc = withChange((d) => {
    d.layout.rootPadding = "24px";
  });
  assert.equal(validate(doc), true, JSON.stringify(validate.errors, null, 2));
});

test("layout.rootPadding rejects a bare number, it is a length not a slug", () => {
  const doc = withChange((d) => {
    d.layout.rootPadding = "40";
  });
  assert.equal(validate(doc), false);
});

test("schemaVersion is pinned so a later revision is detectable", () => {
  const doc = withChange((d) => {
    d.meta.schemaVersion = 2;
  });
  assert.equal(validate(doc), false);
});
