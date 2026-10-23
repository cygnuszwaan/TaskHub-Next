/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const pub = path.join(root, "public");
const html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(pub, "manifest.webmanifest"), "utf8"));
const firebase = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(1, 4).toString(), "PNG", `${file} is a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe("web app manifest", () => {
  it("makes the app installable as a standalone window", () => {
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.name && manifest.short_name);
    assert.equal(manifest.start_url, "/");
    assert.equal(manifest.scope, "/");
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  });
  it("lists icons that exist at their declared size, including a maskable one", () => {
    const purposes = new Set();
    for (const icon of manifest.icons) {
      const [w, h] = pngSize(path.join(pub, icon.src));
      assert.equal(`${w}x${h}`, icon.sizes, icon.src);
      assert.equal(icon.type, "image/png");
      purposes.add(`${icon.sizes} ${icon.purpose}`);
    }
    assert.ok(purposes.has("192x192 any"));
    assert.ok(purposes.has("512x512 any"));
    assert.ok(purposes.has("512x512 maskable"));
  });
  it("has an Apple touch icon", () => {
    assert.deepEqual(pngSize(path.join(pub, "icons", "apple-touch-icon.png")), [180, 180]);
  });
});

describe("public/index.html", () => {
  it("links the manifest, the theme colour and the icons", () => {
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
    assert.match(html, new RegExp(`<meta name="theme-color" content="${manifest.theme_color}">`));
    assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/);
  });
  it("registers the service worker only where it is supported", () => {
    assert.match(html, /"serviceWorker" in navigator\) navigator\.serviceWorker\.register\("\/sw\.js"\)/);
  });
  it("falls back to a redirect sign-in when the popup cannot be used", () => {
    assert.match(html, /signInWithRedirect/);
    assert.match(html, /getRedirectResult/);
  });
});

describe("firebase.json hosting", () => {
  const headers = firebase.hosting.headers || [];
  const forSource = (source) => (headers.find((h) => h.source === source) || {headers: []}).headers;
  it("never lets the service worker or manifest go stale", () => {
    for (const source of ["/sw.js", "/manifest.webmanifest"]) {
      assert.ok(forSource(source).some((h) => h.key === "Cache-Control" && h.value === "no-cache"), source);
    }
  });
  it("serves the manifest with its own content type", () => {
    assert.ok(forSource("/manifest.webmanifest").some((h) => h.key === "Content-Type" && h.value === "application/manifest+json"));
  });
  it("still rewrites every other path to the page", () => {
    assert.deepEqual(firebase.hosting.rewrites, [{source: "**", destination: "/index.html"}]);
  });
});

describe("service worker", () => {
  const listeners = {};
  global.self = {addEventListener: (name, fn) => {
    listeners[name] = fn;
  }};
  const sw = require(path.join(pub, "sw.js"));
  const origin = "https://taskhub-next.web.app";

  it("registers install, activate and fetch handlers", () => {
    for (const name of ["install", "activate", "fetch"]) assert.equal(typeof listeners[name], "function", name);
  });
  it("caches only same-origin GETs for the shell files", () => {
    for (const p of sw.SHELL) assert.ok(sw.isShellRequest("GET", origin + p, origin), p);
    assert.equal(sw.isShellRequest("POST", origin + "/index.html", origin), false);
  });
  it("never caches task data, the functions, Firebase Auth pages or other origins", () => {
    assert.equal(sw.isShellRequest("GET", "https://australia-southeast1-taskhub-next.cloudfunctions.net/getTasks", origin), false);
    assert.equal(sw.isShellRequest("GET", "https://getTasks-abc123-ts.a.run.app/", origin), false);
    assert.equal(sw.isShellRequest("GET", origin + "/__/auth/handler", origin), false);
    assert.equal(sw.isShellRequest("GET", origin + "/__/firebase/init.json", origin), false);
    assert.equal(sw.isShellRequest("GET", origin + "/sw.js", origin), false);
    assert.equal(sw.isShellRequest("GET", "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js", origin), false);
  });
  it("lists only files that exist in public/", () => {
    for (const p of sw.SHELL) assert.ok(fs.existsSync(path.join(pub, p)), p);
  });
});
