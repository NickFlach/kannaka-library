#!/usr/bin/env node
// build-manifest.mjs — resolve sources.json into constellation.json (+ .sig).
//
// For every component with a repo, the latest GitHub release is looked up and
// each declared asset is recorded with its download URL and the sha256 from the
// release's sidecar. The brain section merges brain/registry.json (served
// perplexities, judge scores, exported by the trainer) with the hosted
// endpoint's live model list. The result is signed with ed25519 when a key is
// available; without one the manifest is still written, unsigned, and the
// build says so.
//
//   node scripts/build-manifest.mjs [--out dist] [--offline]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { api, assetText, hasToken, latestRelease } from "./lib/gh.mjs";
import { loadPrivateKey, signBytes } from "./lib/keys.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const args = process.argv.slice(2);
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(ROOT, "dist");
const offline = args.includes("--offline");
const sources = JSON.parse(readFileSync(join(ROOT, "sources.json"), "utf8"));
const log = (m) => process.stderr.write(`[manifest] ${m}\n`);

async function resolveComponent(c) {
  const out = { id: c.id, title: c.title, layer: c.layer, kind: c.kind, blurb: c.blurb };
  if (c.repo) out.repo = `https://github.com/${c.repo}`;
  if (c.private) out.private = true;
  if (c.urls) out.urls = c.urls;
  if (c.huggingface) out.huggingface = c.huggingface.map((r) => `https://huggingface.co/${r}`);
  if (c.hosted) out.hosted = c.hosted;
  if (c.local) out.local = c.local;
  // A component can publish something that is not a version. This library's
  // only tag is the rolling `library` release the portal pulls from, and
  // reporting that as its release would put a delivery mechanism in the column
  // installers read as "what to pin".
  if (!c.repo || c.private || offline || c.no_release) return out;

  let rel = null;
  try { rel = await latestRelease(c.repo); } catch (e) { log(`${c.repo}: release lookup failed: ${e.message}`); }
  if (!rel) { out.release = null; return out; }
  out.release = { version: rel.tag_name, published: rel.published_at, url: rel.html_url };
  const byName = new Map(rel.assets.map((a) => [a.name, a]));
  // Sidecars are evidence about an asset, not assets: a per-file .sha256, a
  // combined SHA256SUMS, and sigstore .sig/.pem pairs. Fold them in rather than
  // listing them, so "asset without a hash" stays a real signal.
  const isSidecar = (n) => /\.(sha256|sig|pem|asc)$/i.test(n) || /^SHA256SUMS/i.test(n);
  const sums = new Map();
  for (const a of rel.assets) {
    if (!/^SHA256SUMS/i.test(a.name) || /\.(sig|pem|asc)$/i.test(a.name)) continue;
    const t = await assetText(a.browser_download_url);
    for (const line of (t || "").split(/\r?\n/)) {
      const m = /^([a-f0-9]{64})\s+\*?(.+?)\s*$/i.exec(line);
      if (m) sums.set(m[2].replace(/^\.\//, ""), m[1].toLowerCase());
    }
  }
  const wanted = (c.assets && c.assets.length) ? c.assets : rel.assets.filter((a) => !isSidecar(a.name)).map((a) => a.name);
  const assets = [];
  for (const name of wanted) {
    const a = byName.get(name);
    if (!a) { log(`${c.repo}@${rel.tag_name}: asset ${name} missing`); continue; }
    let sha256 = sums.get(name) || null;
    const side = byName.get(`${name}.sha256`);
    if (!sha256 && side) {
      const t = await assetText(side.browser_download_url);
      const m = t && /^([a-f0-9]{64})\b/.exec(t.trim());
      sha256 = m ? m[1] : null;
    }
    if (!sha256) log(`${c.repo}@${rel.tag_name}: no sha256 for ${name}`);
    const entry = { name, url: a.browser_download_url, size: a.size, sha256, target: target(name) };
    const sig = byName.get(`${name}.sig`), cert = byName.get(`${name}.pem`);
    if (sig) entry.signature = { sig: sig.browser_download_url, cert: cert ? cert.browser_download_url : null, kind: "sigstore" };
    assets.push(entry);
  }
  out.assets = assets;
  return out;
}

function target(name) {
  const m = /-(linux|macos|windows)-(x86_64|aarch64)(\.exe)?$/.exec(name);
  if (m) return `${m[1]}-${m[2]}`;
  const p = /-(linux|macos|windows)\.(deb|pkg|msi|tar\.gz|zip)$/.exec(name);
  return p ? p[1] : null;
}

async function brainSection(c) {
  let registry = {};
  try { registry = JSON.parse(readFileSync(join(ROOT, "brain", "registry.json"), "utf8")); } catch { /* none yet */ }
  const b = { ...c, models: registry.models || [], registry_exported: registry.exported || null,
    serving: registry.serving || null, reported_family: registry.reported_family || "kannaka-brain", judge_run: registry.judge_run || null };
  if (!offline && c.hosted?.models_url) {
    try {
      const r = await fetch(c.hosted.models_url, { headers: { "user-agent": "kannaka-library" } });
      if (r.ok) { const j = await r.json(); b.hosted = { ...c.hosted, online: !!j.online, models: j.models || [], free_tier: j.free_tier || null }; }
    } catch (e) { log(`hosted brain unreachable: ${e.message}`); }
  }
  return b;
}

/**
 * The manifest as tab-separated lines, for consumers with no JSON parser.
 * Columns: kind, id, a, b, c, d — read per kind, documented in the header.
 *   generated  <iso>
 *   component  <id>  <version|->  <repo|->  <kind>
 *   asset      <id>  <asset name>  <target|->  <url>  <sha256|->
 *   brain      <tag>  <served_ppl|->  <judge_mean|->  <huggingface|->  <serving|->
 *   hosted     brain  <base_url>  <online|offline>  <models csv>
 *   service    <id>  <url>
 *   install    <sh|ps1|brew>  <value>
 */
function tsvOf(m) {
  const L = [];
  const v = (x) => (x === null || x === undefined || x === "" ? "-" : String(x).replace(/[\t\r\n]/g, " "));
  L.push(`# kannaka-constellation/1\tgenerated\t${m.generated}`);
  L.push(`# columns: kind\tid\t...\tsee scripts/build-manifest.mjs`);
  for (const c of m.components) {
    L.push(["component", c.id, v(c.release?.version), v(c.repo), v(c.kind)].join("\t"));
    for (const a of c.assets || []) L.push(["asset", c.id, v(a.name), v(a.target), v(a.url), v(a.sha256)].join("\t"));
    if (c.kind === "model") {
      for (const b of c.models || []) L.push(["brain", v(b.tag), v(b.served_ppl), v(b.judge_mean), v(b.huggingface), v(b.tag === (c.serving || "")) ].join("\t"));
      if (c.hosted) L.push(["hosted", "brain", v(c.hosted.base_url), c.hosted.online ? "online" : "offline", v((c.hosted.models || []).join(","))].join("\t"));
      if (c.local) L.push(["local", "brain", v(c.local.model), v(c.local.from)].join("\t"));
    }
  }
  for (const s of m.services) L.push(["service", v(s.id), v(s.url)].join("\t"));
  for (const [k, val] of Object.entries(m.installers)) L.push(["install", v(k), v(val)].join("\t"));
  return L.join("\n") + "\n";
}

async function main() {
  if (!hasToken()) log("no GitHub token: anonymous API (60 req/h)");
  const components = [];
  for (const c of sources.components) {
    if (c.kind === "model") { components.push(await brainSection(await resolveComponent(c))); continue; }
    components.push(await resolveComponent(c));
    log(`${c.id}: ${components.at(-1).release?.version || (c.private ? "private" : "no release")}`);
  }
  const manifest = {
    schema: "kannaka-constellation/1",
    generated: new Date().toISOString(),
    site: sources.site,
    layers: sources.layers,
    components,
    services: sources.services,
    installers: {
      sh: "https://github.com/kannaka-labs/kannaka-plugin/releases/latest/download/install.sh",
      ps1: "https://github.com/kannaka-labs/kannaka-plugin/releases/latest/download/install.ps1",
      brew: "brew install kannaka-labs/kannaka/kannaka",
      claude_marketplace: "kannaka-labs/kannaka-constellation-marketplace",
    },
  };
  mkdirSync(outDir, { recursive: true });
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(outDir, "constellation.json"), bytes);
  // A shell cannot parse JSON without a dependency, and the installer is a
  // POSIX sh script by design. The same facts go out as tab-separated lines so
  // `awk` is the whole parser: kind, id, version, name, target, url, sha256.
  const tsv = Buffer.from(tsvOf(manifest));
  writeFileSync(join(outDir, "constellation.tsv"), tsv);
  const key = loadPrivateKey();
  if (key) {
    writeFileSync(join(outDir, "constellation.json.sig"), signBytes(bytes, key) + "\n");
    writeFileSync(join(outDir, "constellation.tsv.sig"), signBytes(tsv, key) + "\n");
    log(`signed → ${join(outDir, "constellation.json")} + .tsv (+ .sig each)`);
  } else {
    log(`UNSIGNED → ${join(outDir, "constellation.json")} (no MANIFEST_SIGNING_KEY / key file)`);
  }
  const versions = components.filter((c) => c.release).map((c) => `${c.id}@${c.release.version}`).join(" ");
  log(versions);
}

main().catch((e) => { console.error(e); process.exit(1); });
