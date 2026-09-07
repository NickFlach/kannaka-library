// gh.mjs — the GitHub REST calls the builders need, with a token when one is
// around (GITHUB_TOKEN, GH_TOKEN, or `gh auth token`) and none otherwise.
import { execFileSync } from "node:child_process";

let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
if (!token) {
  try { token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* anonymous */ }
}

export const hasToken = () => !!token;

export async function api(path, { raw = false } = {}) {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const headers = { "user-agent": "kannaka-library", accept: raw ? "application/octet-stream" : "application/vnd.github+json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers, redirect: "follow" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${r.status} ${url}: ${(await r.text()).slice(0, 200)}`);
  return raw ? await r.text() : await r.json();
}

/** Latest release of a repo, or null when it has none. */
export const latestRelease = (repo) => api(`/repos/${repo}/releases/latest`);

/** Text of a small public asset (a .sha256 sidecar) via its browser URL. */
export async function assetText(url) {
  const r = await fetch(url, { headers: { "user-agent": "kannaka-library" }, redirect: "follow" });
  if (!r.ok) return null;
  return await r.text();
}
