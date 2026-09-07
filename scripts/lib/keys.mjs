// keys.mjs — ed25519 signing for constellation.json.
//
// The private key is a PEM (PKCS#8) held OUTSIDE the repo: MANIFEST_SIGNING_KEY
// in the environment (the Actions secret) or ~/.kannaka/keys/constellation-manifest.pem
// locally. The public key ships in the repo as manifest.pub and inside every
// installer that verifies. A signature is over the exact bytes of the file.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_KEY_PATH = join(homedir(), ".kannaka", "keys", "constellation-manifest.pem");

export function loadPrivateKey() {
  const pem = process.env.MANIFEST_SIGNING_KEY || (existsSync(DEFAULT_KEY_PATH) ? readFileSync(DEFAULT_KEY_PATH, "utf8") : "");
  if (!pem.trim()) return null;
  return createPrivateKey(pem);
}

export function generate(path = DEFAULT_KEY_PATH) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  return publicKey.export({ type: "spki", format: "pem" });
}

export const signBytes = (bytes, key) => sign(null, bytes, key).toString("base64");

export function verifyBytes(bytes, sigB64, pubPem) {
  try { return verify(null, bytes, createPublicKey(pubPem), Buffer.from(sigB64, "base64")); } catch { return false; }
}

// CLI: node scripts/lib/keys.mjs keygen | verify <file> <sigfile> <pubfile>
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("keys.mjs")) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === "keygen") {
    if (existsSync(DEFAULT_KEY_PATH) && !a.includes("--force")) { console.error(`refusing to overwrite ${DEFAULT_KEY_PATH} (pass --force)`); process.exit(2); }
    const pub = generate();
    writeFileSync(new URL("../../manifest.pub", import.meta.url), pub);
    console.log(`private key → ${DEFAULT_KEY_PATH}\npublic key  → manifest.pub`);
  } else if (cmd === "verify") {
    const [file, sigfile, pubfile] = a;
    const ok = verifyBytes(readFileSync(file), readFileSync(sigfile, "utf8").trim(), readFileSync(pubfile, "utf8"));
    console.log(ok ? "signature OK" : "signature INVALID");
    process.exit(ok ? 0 : 1);
  } else {
    console.error("usage: keys.mjs keygen [--force] | verify <file> <sig> <pub>");
    process.exit(2);
  }
}
