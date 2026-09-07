import { test } from "node:test";
import assert from "node:assert/strict";
import { render, frontMatter, slugify } from "../scripts/lib/md.mjs";

test("headings get ids and the first h1 is the title", () => {
  const r = render("# ADR-0001: The Thing\n\nbody\n\n## Status\n\nAccepted\n");
  assert.equal(r.title, "ADR-0001: The Thing");
  assert.match(r.html, /<h1 id="adr-0001-the-thing">/);
  assert.match(r.html, /<h2 id="status">/);
  assert.deepEqual(r.headings.map((h) => h.level), [1, 2]);
});

test("fenced code is escaped and not parsed", () => {
  const r = render("```sh\nkannaka recall \"a <b>\" --top-k 5\n# not a heading\n```\n");
  assert.match(r.html, /<pre><code class="language-sh">kannaka recall &quot;a &lt;b&gt;&quot; --top-k 5\n# not a heading\n<\/code><\/pre>/);
  assert.equal(r.headings.length, 0);
});

test("lists nest by indent and task items render checkboxes", () => {
  const r = render("- one\n  - one.a\n- [x] done\n- [ ] todo\n\n1. first\n2. second\n");
  assert.match(r.html, /<ul><li>one<ul><li>one\.a<\/li><\/ul><\/li><li><input type="checkbox" disabled checked> done<\/li><li><input type="checkbox" disabled> todo<\/li><\/ul>/);
  assert.match(r.html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test("pipe tables with alignment", () => {
  const r = render("| a | b |\n|:--|--:|\n| 1 | `x` |\n");
  assert.match(r.html, /<table><thead><tr><th style="text-align:left">a<\/th><th style="text-align:right">b<\/th>/);
  assert.match(r.html, /<td style="text-align:right"><code>x<\/code><\/td>/);
});

test("links pass through the resolver; images are marked", () => {
  const seen = [];
  render("[adr](../adr/ADR-0002-x.md#status) ![pic](img/a.png) <https://x.y/z>", { resolveLink: (h, o) => { seen.push([h, o.image]); return "R:" + h; } });
  assert.deepEqual(seen, [["img/a.png", true], ["../adr/ADR-0002-x.md#status", false]]);
});

test("inline emphasis and code, html escaped", () => {
  const r = render("**bold** and *em* and `a<b` and 5 * 3 * 2 stays\n");
  assert.match(r.html, /<strong>bold<\/strong> and <em>em<\/em> and <code>a&lt;b<\/code> and 5 \* 3 \* 2 stays/);
});

test("blockquotes, rules, raw html blocks", () => {
  const r = render("> quoted **x**\n\n---\n\n<details><summary>s</summary>\nraw\n</details>\n");
  assert.match(r.html, /<blockquote><p>quoted <strong>x<\/strong><\/p><\/blockquote>/);
  assert.match(r.html, /<hr>/);
  assert.match(r.html, /<details><summary>s<\/summary>\nraw\n<\/details>/);
});

test("front matter is split and lower-cased", () => {
  const { meta, body } = frontMatter("---\nTitle: \"T\"\nstatus: Accepted\n---\n# H\n");
  assert.deepEqual(meta, { title: "T", status: "Accepted" });
  assert.equal(body, "# H\n");
  assert.equal(slugify("Hello, World! (v2)"), "hello-world-v2");
});

test("setext headings and paragraphs join lines", () => {
  const r = render("Title\n=====\n\nline one\nline two\n");
  assert.match(r.html, /<h1 id="title">/);
  assert.match(r.html, /<p>line one line two<\/p>/);
});

test("raw html blocks route their links through the resolver", () => {
  const r = render('<p align="center">\n  <a href="VISION.md">Vision</a> · <a href="https://x.y">out</a>\n  <img src="docs/a.png">\n</p>\n', { resolveLink: (h, o) => `R${o.image ? "I" : ""}:${h}` });
  assert.match(r.html, /<a href="R:VISION\.md">Vision<\/a>/);
  assert.match(r.html, /<a href="https:\/\/x\.y">out<\/a>/);
  assert.match(r.html, /<img src="RI:docs\/a\.png">/);
});
