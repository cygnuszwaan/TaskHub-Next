/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));

// The two variable blocks: the light set on :root, and the dark overrides inside the prefers-color-scheme query
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const lightBlock = css.slice(css.indexOf(":root {"), darkStart);
const darkBlock = css.slice(darkStart, css.indexOf("}\n    }", darkStart));
const rest = css.slice(0, css.indexOf(":root {")) + css.slice(css.indexOf("}\n    }", darkStart) + 7);
const defined = (block) => new Set([...block.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));

describe("dark mode", () => {
  it("lets the browser pick its own dark form controls and scrollbars", () => {
    assert.match(lightBlock, /color-scheme: light dark;/);
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
  it("gives the browser UI a dark theme colour too", () => {
    assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)">/i);
  });
});
