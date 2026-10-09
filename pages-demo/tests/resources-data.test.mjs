import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const directory = JSON.parse(readFileSync(new URL("../src/housing-resources.json", import.meta.url), "utf8"));
const requiredCategories = ["eviction", "homelessness", "legal", "emergency"];
const localCounties = ["hillsborough", "pinellas", "pasco"];

test("static housing directory has complete, distinct, linkable records", () => {
  assert.match(directory.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(directory.resources.length >= 12);
  const ids = new Set();
  for (const resource of directory.resources) {
    assert.match(resource.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(resource.id), `duplicate id: ${resource.id}`);
    ids.add(resource.id);
    for (const field of ["organization", "program", "description", "eligibility", "availability", "verifiedAt"]) {
      assert.ok(typeof resource[field] === "string" && resource[field].trim(), `${resource.id}: missing ${field}`);
    }
    assert.match(resource.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(resource.categories.length > 0);
    assert.ok(resource.categories.every((category) => requiredCategories.includes(category)));
    assert.ok(resource.geography.length > 0);
    assert.ok(resource.geography.every((place) => [...localCounties, "florida", "national"].includes(place)));
    for (const field of ["url", "sourceUrl"]) {
      const url = new URL(resource[field]);
      assert.equal(url.protocol, "https:", `${resource.id}: ${field} must use HTTPS`);
      assert.equal(url.username, "");
      assert.equal(url.password, "");
    }
    assert.ok(resource.contacts.length > 0, `${resource.id}: contact missing`);
    for (const contact of resource.contacts) {
      assert.ok(contact.label && contact.value);
      assert.ok(["phone", "text", "web"].includes(contact.kind));
    }
  }
  assert.ok(ids.has("emergency-911"));
  assert.ok(ids.has("emergency-988"));
});

test("each Tampa Bay county has direct records for the four crisis categories", () => {
  for (const county of localCounties) {
    for (const category of requiredCategories) {
      assert.ok(directory.resources.some((resource) => resource.geography.includes(county) && resource.categories.includes(category)), `${county} lacks ${category}`);
    }
  }
});
