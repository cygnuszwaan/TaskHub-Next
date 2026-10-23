/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));

// The variable blocks: the light set on :root, the dark overrides under the device query (unless light was chosen
// in the page) and the same overrides when dark was chosen in the page.
const lightStart = css.indexOf(":root {");
const deviceStart = css.indexOf("@media (prefers-color-scheme: dark)");
const deviceOpen = css.indexOf(":root:not([data-theme=\"light\"]) {", deviceStart);
const deviceEnd = css.indexOf("}\n    }", deviceStart);
const chosenStart = css.indexOf(":root[data-theme=\"dark\"] {");
const chosenEnd = css.indexOf("}\n", chosenStart);
const lightBlock = css.slice(lightStart, deviceStart);
const darkBlock = css.slice(deviceOpen, deviceEnd);
const chosenBlock = css.slice(chosenStart, chosenEnd);
const rest = css.slice(0, lightStart) + css.slice(deviceEnd + 7, chosenStart) + css.slice(chosenEnd);
const defined = (block) => new Set([...block.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
const declarations = (block) => [...block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => `${m[1]}:${m[2].trim()}`);

describe("dark mode", () => {
  it("lets the browser pick its own dark form controls and scrollbars", () => {
    assert.match(lightBlock, /color-scheme: light dark;/);
  });
  it("follows the device's dark setting unless the page has chosen light", () => {
    assert.ok(deviceOpen > deviceStart, "the device query must apply to :root:not([data-theme=\"light\"])");
  });
  it("gives the page's own dark choice exactly the same colours as the device's", () => {
    assert.ok(chosenStart > 0);
    assert.deepEqual(declarations(chosenBlock), declarations(darkBlock));
    assert.match(chosenBlock, /color-scheme: dark;/);
  });
  it("makes the page's light choice a light colour scheme", () => {
    assert.match(css, /:root\[data-theme="light"\] \{ color-scheme: light; \}/);
  });
  it("overrides the core colours under prefers-color-scheme: dark", () => {
    for (const name of ["--bg", "--surface", "--text"]) assert.ok(defined(darkBlock).has(name), name);
  });
  it("overrides every variable except the few that look right on both", () => {
    const keep = new Set(["--primary", "--success", "--danger", "--toast-link"]);
    const missing = [...defined(lightBlock)].filter((name) => !defined(darkBlock).has(name) && !keep.has(name));
    assert.deepEqual(missing, []);
    for (const name of defined(darkBlock)) assert.ok(defined(lightBlock).has(name), `${name} is overridden but never defined for light`);
  });
  it("uses only variables that are defined", () => {
    const used = new Set([...html.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
    for (const name of used) assert.ok(defined(lightBlock).has(name), `${name} is used but not defined`);
  });
  it("takes every colour in the stylesheet and the page from those variables", () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/g;
    assert.deepEqual(rest.match(hex) || [], [], "a hex colour in the stylesheet outside the variable blocks");
    const page = html.slice(html.indexOf("</style>")).replace(/<meta name="theme-color"[^>]*>/g, "");
    assert.deepEqual(page.match(hex) || [], [], "a hex colour in the page markup or script");
  });
  it("gives the browser UI a dark theme colour too, which the page can override", () => {
    assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)" data-scheme="dark">/i);
    assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)" data-scheme="light">/i);
  });
  it("applies the saved choice before the stylesheet, so the page does not flash", () => {
    const early = html.indexOf("localStorage.getItem(\"taskhub-theme\")");
    assert.ok(early > 0 && early < html.indexOf("<style>"));
  });
});
