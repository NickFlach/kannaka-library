#!/usr/bin/env node
// org-move.mjs — move the constellation into one GitHub organisation, one
// repository at a time, checking after each that nothing downstream broke.
//
//   node scripts/org-move.mjs --org <name> --check                 what would move, and from which account
//   node scripts/org-move.mjs --org <name> --probe <repo>          transfer ONE repo and test every URL shape
//   node scripts/org-move.mjs --org <name> --move public           transfer the public repos
//   node scripts/org-move.mjs --org <name> --move private          transfer the private ones
//   node scripts/org-move.mjs --org <name> --verify                every manifest URL still resolves
//   node scripts/org-move.mjs --org <name> --list <file> ...       same, for a repo list other than
//                                                                  sources.json (e.g. scripts/lists/spacechild-labs.json)
//
// Why one at a time: GitHub redirects clone, fetch, push and release-download
// URLs after a transfer, but the guarantee is not identical for every URL
// shape the constellation depends on — raw.githubusercontent.com, the
// Homebrew tap's release URLs, `claude plugin marketplace add owner/repo`, and
// a CI job that curls a release asset from another repo. --probe moves the
// least-load-bearing repo first and TESTS each of those shapes before anything
// else follows it.
//
// Repos owned by `flaukowski` need that account's token: NickFlach has push on
// them, not admin, and a transfer needs admin. Pass it as FLAUKOWSKI_TOKEN.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const args = process.argv.slice(2);
const opt = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const has = (k) => args.includes(k);
const ORG = opt("--org");
if (!ORG) { console.error("--org <name> is required"); process.exit(2); }
// The repo list defaults to the constellation's sources.json. --list <file> points
// the same machinery at another family of repositories (2026-09-08: the Space
// Child repos moving to their own organisation); the file has the same shape,
// `{ "components": [ { "id", "repo", "private", "kind", "hold" } ] }`, and an
// entry with `"hold": true` is listed by --check but never moved — the
// candidates the owner has not decided on yet.
const LIST = opt("--list") ? join(process.cwd(), opt("--list")) : join(ROOT, "sources.json");
const sources = JSON.parse(readFileSync(LIST, "utf8"));
const log = (m) => console.log(m);

const repos = sources.components.filter((c) => c.repo).map((c) => ({
  id: c.id, repo: c.repo, owner: c.repo.split("/")[0], name: c.repo.split("/")[1],
  private: !!c.private, kind: c.kind, hold: !!c.hold,
}));

function gh(pathname, { method = "GET", body = null, token = null, raw = false } = {}) {
  const a = ["api", pathname, "-X", method];
  if (body) for (const [k, v] of Object.entries(body)) a.push("-f", `${k}=${v}`);
  const env = { ...process.env };
  if (token) env.GH_TOKEN = token;
  try {
    const out = execFileSync("gh", a, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
    return raw ? out : (out ? JSON.parse(out) : null);
  } catch (e) {
    return { __error: (e.stderr || e.message || "").trim().split("\n").slice(0, 2).join(" ") };
  }
}

const tokenFor = (owner) => (owner === "flaukowski" ? (process.env.FLAUKOWSKI_TOKEN || null) : null);

// What a transfer is known to put at risk, read BEFORE and AFTER so the answer
// is measured rather than assumed. Secret VALUES cannot be read back through
// the API — only names — so a secret that does not survive must be re-entered
// by hand, and for kannaka-plugin that means the macOS signing certificate.
function repoState(repo, token = null) {
  const info = gh(`repos/${repo}`, { token });
  if (info.__error) return { error: info.__error };
  const secrets = gh(`repos/${repo}/actions/secrets`, { token });
  const vars = gh(`repos/${repo}/actions/variables`, { token });
  const envs = gh(`repos/${repo}/environments`, { token });
  const pages = gh(`repos/${repo}/pages`, { token });
  const hooks = gh(`repos/${repo}/hooks`, { token });
  return {
    owner: info.owner.login, private: info.private, default_branch: info.default_branch,
    secrets: secrets.__error ? null : (secrets.secrets || []).map((s) => s.name).sort(),
    variables: vars.__error ? null : (vars.variables || []).map((v) => v.name).sort(),
    environments: envs.__error ? null : (envs.environments || []).map((e) => e.name).sort(),
    pages: pages.__error ? null : { url: pages.html_url, build_type: pages.build_type, status: pages.status },
    hooks: Array.isArray(hooks) ? hooks.length : null,
    stars: info.stargazers_count, issues: info.open_issues_count,
  };
}

function diffState(before, after) {
  const lost = (a, b) => (a || []).filter((x) => !(b || []).includes(x));
  const out = [];
  const sl = lost(before.secrets, after.secrets);
  const vl = lost(before.variables, after.variables);
  const el = lost(before.environments, after.environments);
  out.push(`  secrets      ${(before.secrets || []).length} → ${(after.secrets || []).length}${sl.length ? `   LOST: ${sl.join(", ")}` : "   all kept"}`);
  out.push(`  variables    ${(before.variables || []).length} → ${(after.variables || []).length}${vl.length ? `   LOST: ${vl.join(", ")}` : ""}`);
  out.push(`  environments ${(before.environments || []).length} → ${(after.environments || []).length}${el.length ? `   LOST: ${el.join(", ")}` : ""}`);
  out.push(`  webhooks     ${before.hooks} → ${after.hooks}`);
  out.push(`  pages        ${before.pages ? before.pages.url : "none"} → ${after.pages ? after.pages.url : "NONE"}`);
  out.push(`  stars        ${before.stars} → ${after.stars}`);
  return { lines: out, lostSecrets: sl, lostVars: vl, lostEnvs: el, lostPages: !!before.pages && !after.pages };
}

// flaukowski can only transfer INTO an org it belongs to. The invitation is
// sent by an org owner; accepting it is something that account does itself,
// which its token can do.
async function joinOrg() {
  const token = process.env.FLAUKOWSKI_TOKEN;
  if (!token) { log("no FLAUKOWSKI_TOKEN — cannot accept an invitation on that account's behalf"); return false; }
  const m = gh(`user/memberships/orgs/${ORG}`, { token });
  if (m.__error) { log(`flaukowski has no invitation to ${ORG} yet (invite it from the org's People page)`); return false; }
  if (m.state === "active") { log(`flaukowski is already a member of ${ORG} (${m.role})`); return true; }
  const r = gh(`user/memberships/orgs/${ORG}`, { method: "PATCH", body: { state: "active" }, token });
  if (r.__error) { log(`could not accept the invitation: ${r.__error}`); return false; }
  log(`flaukowski accepted the invitation to ${ORG} (${r.role})`);
  return true;
}

// Does a URL answer, following redirects? Reports the final URL so a redirect
// that lands somewhere unexpected is visible rather than counted as success.
async function probeUrl(label, url, { expect = 200 } = {}) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "user-agent": "kannaka-org-move" } });
    const moved = r.url !== url;
    const ok = r.status === expect;
    log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(34)} ${r.status}${moved ? `  →  ${r.url}` : ""}`);
    return ok;
  } catch (e) {
    log(`  FAIL ${label.padEnd(34)} ${e.message}`);
    return false;
  }
}

async function checkAll() {
  log(`Target organisation: ${ORG}\n`);
  const orgInfo = gh(`orgs/${ORG}`);
  if (orgInfo.__error) {
    const user = gh(`users/${ORG}`);
    if (!user.__error && user.type === "User") {
      // Measured on 2026-09-07: POST /repos/{owner}/{repo}/transfer with a USER
      // as new_owner is accepted, and then nothing observable happens. The repo
      // keeps its original owner and the receiving account's
      // /user/repository_invitations stays empty — a repository transfer is not
      // a repository invitation, and its acceptance is not in the API. So a
      // user destination cannot be scripted; an organisation destination can,
      // because a transfer into an org you can create repos in is immediate.
      log(`${ORG} is a USER account, not an organisation.`);
      log(`A transfer to a user waits for that user to accept it in a browser, and the`);
      log(`acceptance is not exposed by the API, so this move cannot be scripted into a`);
      log(`user account. Create an organisation (any account can own one) and use its name.\n`);
    } else {
      log(`The organisation does not exist yet (${orgInfo.__error}).`);
      log(`Create it at https://github.com/organizations/plan — github.com has no API for it.\n`);
    }
  } else {
    log(`Organisation exists: ${orgInfo.login} (${orgInfo.public_repos} public repos)\n`);
  }
  const rows = [];
  for (const r of repos) {
    const info = gh(`repos/${r.repo}`);
    if (info.__error) { rows.push([r.repo, "?", "gone or unreachable"]); continue; }
    const admin = info.permissions && info.permissions.admin;
    const canMove = admin || (r.owner === "flaukowski" && !!process.env.FLAUKOWSKI_TOKEN);
    rows.push([r.repo, info.private ? "private" : "public",
      info.owner.login === ORG ? "ALREADY MOVED" : r.hold ? "HOLD (not decided)" : canMove ? "ready" : `NEEDS ${r.owner} token (admin=false)`]);
  }
  const w = Math.max(...rows.map((x) => x[0].length));
  for (const [a, b, c] of rows) log(`  ${a.padEnd(w)}  ${b.padEnd(8)}  ${c}`);
  const blocked = rows.filter((x) => x[2].startsWith("NEEDS")).length;
  log(`\n${rows.length} repositories, ${blocked} blocked on a token.`);
}

function transfer(r) {
  const token = tokenFor(r.owner);
  if (r.owner === "flaukowski" && !token) return { __error: "no FLAUKOWSKI_TOKEN" };
  const res = gh(`repos/${r.repo}/transfer`, { method: "POST", body: { new_owner: ORG }, token });
  return res;
}

// The URL shapes the constellation actually depends on, for one repo.
async function probeShapes(repo, { release = null } = {}) {
  const [, name] = repo.split("/");
  const oldUrl = `https://github.com/${repo}`;
  const newUrl = `https://github.com/${ORG}/${name}`;
  log(`\nURL shapes for ${repo} → ${ORG}/${name}:`);
  let ok = true;
  ok = (await probeUrl("repo page (old → new)", oldUrl)) && ok;
  ok = (await probeUrl("repo page (new)", newUrl)) && ok;
  // raw.githubusercontent is the one that matters most: install.sh is fetched
  // from it, and `claude plugin marketplace add` reads a file through it.
  ok = (await probeUrl("raw.githubusercontent (old path)", `https://raw.githubusercontent.com/${repo}/HEAD/README.md`)) && ok;
  if (release) {
    ok = (await probeUrl("release asset (old path)", `${oldUrl}/releases/download/${release.tag}/${release.asset}`)) && ok;
  }
  // git clone over https: the operation the tap, CI and every developer uses.
  try {
    execFileSync("git", ["ls-remote", `${oldUrl}.git`, "HEAD"], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
    log(`  ok   git ls-remote (old url)`);
  } catch (e) { log(`  FAIL git ls-remote (old url)          ${(e.stderr || "").toString().slice(0, 80)}`); ok = false; }
  return ok;
}

async function move(which) {
  const set = repos.filter((r) => !r.hold && (which === "private" ? r.private : !r.private));
  log(`Moving ${set.length} ${which} repositories into ${ORG}.\n`);
  const moved = [];
  for (const r of set) {
    const info = gh(`repos/${r.repo}`);
    if (!info.__error && info.owner.login === ORG) { log(`  skip ${r.repo} (already in ${ORG})`); continue; }
    const res = transfer(r);
    if (res.__error) { log(`  FAIL ${r.repo}: ${res.__error}`); continue; }
    log(`  ok   ${r.repo} → ${ORG}/${r.name}`);
    moved.push(r);
  }
  if (moved.length) {
    log(`\nUpdating ${LIST}…`);
    let raw = readFileSync(LIST, "utf8");
    for (const r of moved) raw = raw.split(`"${r.repo}"`).join(`"${ORG}/${r.name}"`);
    writeFileSync(LIST, raw);
    log(`  ${moved.length} entries repointed. Rebuild the manifest and run --verify.`);
  }
}

// Every asset URL in the published manifest must still resolve after a move.
// A redirect is fine; a 404 means something downstream is broken right now.
async function verify() {
  if (opt("--list")) { log("--verify checks the constellation manifest; a --list move has no manifest. Use --probe per repo."); return true; }
  const manifest = JSON.parse(readFileSync(join(ROOT, "dist", "constellation.json"), "utf8"));
  let bad = 0, n = 0;
  for (const c of manifest.components) {
    for (const a of c.assets || []) {
      n++;
      const r = await fetch(a.url, { method: "HEAD", redirect: "follow", headers: { "user-agent": "kannaka-org-move" } });
      if (!r.ok) { log(`  FAIL ${c.id} ${a.name} → ${r.status}`); bad++; }
    }
  }
  log(`${n} asset URLs checked, ${bad} broken.`);
  return bad === 0;
}

if (has("--join")) { process.exit((await joinOrg()) ? 0 : 1); }
else if (has("--state")) {
  const id = opt("--state");
  const r = repos.find((x) => x.id === id || x.repo === id || x.name === id);
  if (!r) { console.error(`unknown repo ${id}`); process.exit(2); }
  console.log(JSON.stringify(repoState(r.repo, tokenFor(r.owner)), null, 2));
}
else if (has("--check")) await checkAll();
else if (has("--probe")) {
  const id = opt("--probe");
  const r = repos.find((x) => x.id === id || x.repo === id || x.name === id);
  if (!r) { console.error(`unknown repo ${id}`); process.exit(2); }
  const rel = gh(`repos/${r.repo}/releases/latest`);
  const release = rel && !rel.__error && rel.assets && rel.assets.length
    ? { tag: rel.tag_name, asset: rel.assets[0].name } : null;
  const before = repoState(r.repo, tokenFor(r.owner));
  if (before.error) { console.error(`cannot read ${r.repo}: ${before.error}`); process.exit(1); }
  log(`Before: ${(before.secrets || []).length} secrets, ${(before.environments || []).length} environments, pages=${before.pages ? before.pages.url : "none"}`);
  log(`Transferring ${r.repo} → ${ORG}/${r.name} …`);
  const res = transfer(r);
  if (res.__error) { console.error(`  FAIL: ${res.__error}`); process.exit(1); }
  log(`  transferred. Waiting for the redirect to settle…`);
  await new Promise((s) => setTimeout(s, 8000));
  const after = repoState(`${ORG}/${r.name}`, tokenFor(r.owner));
  if (after.error) { console.error(`cannot read ${ORG}/${r.name}: ${after.error}`); process.exit(1); }
  log(`\nWhat survived the transfer:`);
  const d = diffState(before, after);
  for (const l of d.lines) log(l);
  const ok = await probeShapes(r.repo, { release });
  const clean = ok && !d.lostSecrets.length && !d.lostVars.length && !d.lostEnvs.length && !d.lostPages;
  log(clean
    ? `\nEverything survived. Safe to move the rest.`
    : `\nSomething did NOT survive. Fix or re-enter it before moving anything else:` +
      (d.lostSecrets.length ? `\n  re-enter secrets: ${d.lostSecrets.join(", ")}` : "") +
      (d.lostPages ? `\n  re-enable GitHub Pages on the new owner` : ""));
  process.exit(clean ? 0 : 1);
} else if (has("--move")) await move(opt("--move", "public"));
else if (has("--verify")) process.exit((await verify()) ? 0 : 1);
else { console.error("one of --check | --probe <repo> | --move public|private | --verify"); process.exit(2); }
