#!/usr/bin/env node
// repoint.mjs — rewrite the owner in the places that RUN, after a move.
//
//   node scripts/repoint.mjs --org <name>            # dry run: show every change
//   node scripts/repoint.mjs --org <name> --apply    # write them
//
// GitHub redirects clone, fetch, push and release-download URLs after a
// transfer, so nothing here is urgent — but a redirect is a promise someone
// else keeps, and these are the strings that decide which binary lands on a
// stranger's machine. They should say what is true.
//
// Deliberately narrow: only files whose content is executed or fetched, and
// only repositories this checkout can see. Prose links in READMEs are left to
// the redirect; rewriting every mention would bury the real changes in noise.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const args = process.argv.slice(2);
const ORG = args.includes("--org") ? args[args.indexOf("--org") + 1] : null;
const APPLY = args.includes("--apply");
if (!ORG) { console.error("--org <name> is required"); process.exit(2); }

// repo → file → the exact strings to rewrite. Every entry is something a
// machine reads: a default in an installer, a URL it fetches itself from, a
// component it pins, a marketplace it registers, a formula's download.
const TARGETS = [
  ["kannaka-plugin", "install/install.sh", [
    "NickFlach/kannaka-memory", "NickFlach/kannaka-tui", "NickFlach/kannaka-plugin", "flaukowski/kannaka-hdl",
  ]],
  ["kannaka-plugin", "install/install.ps1", [
    "NickFlach/kannaka-memory", "NickFlach/kannaka-tui", "NickFlach/kannaka-plugin", "flaukowski/kannaka-hdl",
  ]],
  ["kannaka-library", "scripts/build-manifest.mjs", [
    "NickFlach/kannaka-plugin", "NickFlach/kannaka-constellation-marketplace",
  ]],
  ["kannaka-library", "scripts/build-library.mjs", ["NickFlach/kannaka-library"]],
  ["kannaka-library", "scripts/portal-pull.sh", ["NickFlach/kannaka-library"]],
  ["kannaka-library", "sources.json", null],            // every repo reference
  ["homebrew-kannaka", "Formula/kannaka.rb", ["NickFlach/kannaka-memory"]],
  ["kannaka-constellation-marketplace", ".claude-plugin/marketplace.json", null],
  ["kannaka-apps", ".github/workflows/ci.yml", ["flaukowski/kannaka-hdl"]],
];

// Hugging Face is a different account system and a GitHub move must not touch
// it. Matching only the URL forms was not enough: sources.json lists the
// weights as BARE ids ("huggingface": ["flaukowski/kannaka-brain-v2-GGUF"]),
// which look exactly like GitHub repo references, so a URL-shaped guard
// happily repointed every model link at an org that does not exist over there.
// Match the word wherever it appears on the line, plus the bare-id fields that
// name a model rather than a repository.
const KEEP = /huggingface|hf\.co|"lora"|"from"/i;

// Only rewrite a reference once the repository is ACTUALLY in the org. Doing
// it ahead of the move points live URLs at a 404: the portal's puller was
// repointed at kannaka-labs/kannaka-library while that repository was still
// the one repo the move could not take, and the next pull aborted on a missing
// tarball. Ask GitHub, and cache the answer per repository.
const seen = new Map();
function movedAlready(name) {
  if (seen.has(name)) return seen.get(name);
  let out = false;
  try {
    out = execFileSync("gh", ["api", `repos/${ORG}/${name}`, "--jq", ".owner.login"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === ORG;
  } catch { out = false; }
  seen.set(name, out);
  return out;
}

const OWNERS = /\b(NickFlach|flaukowski)\/([A-Za-z0-9._-]+)/g;
let files = 0, edits = 0, missing = 0;
const skipped = new Set();

for (const [repo, rel, only] of TARGETS) {
  const p = join(ROOT, repo, rel);
  if (!existsSync(p)) { console.log(`  --   ${repo}/${rel} (not in this checkout)`); missing++; continue; }
  const before = readFileSync(p, "utf8");
  let n = 0;
  const after = before.split("\n").map((line) => {
    if (KEEP.test(line)) return line;
    return line.replace(OWNERS, (m, owner, name) => {
      if (only && !only.includes(`${owner}/${name}`)) return m;
      if (owner === ORG) return m;
      if (!movedAlready(name)) { skipped.add(owner + "/" + name); return m; }
      n++;
      return `${ORG}/${name}`;
    });
  }).join("\n");
  if (!n) { console.log(`  ok   ${repo}/${rel} (nothing to change)`); continue; }
  files++; edits += n;
  console.log(`  ${APPLY ? "EDIT" : "would"} ${repo}/${rel}: ${n} reference${n === 1 ? "" : "s"}`);
  if (!APPLY) {
    const b = before.split("\n"), a = after.split("\n");
    for (let i = 0; i < b.length; i++) if (b[i] !== a[i]) console.log(`         - ${b[i].trim().slice(0, 110)}\n         + ${a[i].trim().slice(0, 110)}`);
  } else {
    writeFileSync(p, after);
  }
}

console.log(`\n${edits} references across ${files} files${missing ? `, ${missing} not in this checkout` : ""}.`);
if (skipped.size) console.log(`left alone (not in ${ORG} yet): ${[...skipped].join(", ")}`);
if (!APPLY) console.log("Dry run. Re-run with --apply to write, then commit each repository.");
