#!/bin/sh
# portal-pull.sh — refresh ninja-portal.com's copy of the library and the
# constellation manifest. Runs ON the portal box (buzz) from cron.
#
#   */30 * * * * /home/opc/bin/portal-pull.sh >> /tmp/portal-pull.log 2>&1
#
# The portal PULLS. The alternative — the library's public GitHub Actions
# workflow pushing over SSH — would mean a key to this box living in a public
# repository's secrets, to save a timer.
#
# Nothing is swapped in until it is verified and complete:
#   1. fetch the tarball and its sha256, check the digest;
#   2. fetch the manifest and, when openssl 3 is present, check its ed25519
#      signature against the pinned public key;
#   3. extract to a staging directory, confirm index.html and the manifest are
#      both there, and only then move it into place.
# A partial or wrong download leaves the live site untouched.
set -eu

REL="${LIBRARY_RELEASE:-https://github.com/NickFlach/kannaka-library/releases/download/library}"
WEB="${PORTAL_WEB:-/usr/share/nginx/ninja-portal}"
WORK="${PORTAL_PULL_WORK:-/tmp/portal-pull}"
PUB="${MANIFEST_PUB:-/etc/ninja-portal-manifest.pub}"

log() { printf '[portal-pull] %s %s\n' "$(date -u +%FT%TZ)" "$1"; }
die() { log "ABORT: $1"; exit 1; }

rm -rf "$WORK"; mkdir -p "$WORK/stage"
cd "$WORK"

log "fetching library-site.tar.gz"
curl -fsSL --max-time 120 "$REL/library-site.tar.gz" -o site.tar.gz || die "tarball download failed"
curl -fsSL --max-time 30 "$REL/library-site.tar.gz.sha256" -o site.sha || die "checksum download failed"
want=$(awk '{print $1}' site.sha)
got=$(sha256sum site.tar.gz | awk '{print $1}')
[ -n "$want" ] || die "empty checksum"
[ "$want" = "$got" ] || die "tarball sha256 mismatch (want $want got $got)"
log "tarball verified"

for f in constellation.json constellation.json.sig constellation.tsv constellation.tsv.sig manifest.pub; do
  curl -fsSL --max-time 30 "$REL/$f" -o "$f" || die "$f download failed"
done
head -1 constellation.tsv | grep -q '^# kannaka-constellation/1' || die "constellation.tsv is not a manifest"

# Verify the signature against the key PINNED ON THIS BOX, never against the
# manifest.pub that arrived with the download — a signature checked against a
# key from the same place as the file proves nothing.
if [ -s "$PUB" ] && command -v openssl >/dev/null 2>&1 && openssl version | grep -q '^OpenSSL 3'; then
  for f in constellation.json constellation.tsv; do
    base64 -d < "$f.sig" > "$f.sigraw" || die "$f.sig is not base64"
    openssl pkeyutl -verify -pubin -inkey "$PUB" -rawin -in "$f" -sigfile "$f.sigraw" >/dev/null 2>&1 \
      || die "$f signature did not verify against $PUB"
  done
  log "manifest signatures verified"
else
  log "signature NOT checked (no pinned key at $PUB, or openssl is not 3.x)"
fi

tar -xzf site.tar.gz -C stage || die "extract failed"
[ -s stage/index.html ] || die "extracted site has no index.html"
[ -s stage/adr.html ] || die "extracted site has no ADR index"

# Swap the library directory in one move, then place the manifest files at the
# site root where the installer's default URL points.
rm -rf "$WEB/library.old"
[ -d "$WEB/library" ] && mv "$WEB/library" "$WEB/library.old"
mv stage "$WEB/library"
chmod -R a+rX "$WEB/library"
chown -R "$(stat -c %u "$WEB"):$(stat -c %g "$WEB")" "$WEB/library" 2>/dev/null || true
# SELinux: a tree that arrived via /tmp carries user_tmp_t, and nginx is
# refused every file in it — a 403 on every library page with a correct-looking
# directory listing on disk. Same trap as /usr/local/bin/nats. Relabel it.
if command -v restorecon >/dev/null 2>&1; then
  restorecon -RF "$WEB/library" >/dev/null 2>&1 || log "restorecon failed — expect 403s if SELinux is enforcing"
fi
for f in constellation.json constellation.json.sig constellation.tsv constellation.tsv.sig manifest.pub; do
  install -m 0644 "$f" "$WEB/$f"
done
rm -rf "$WEB/library.old"

gen=$(head -1 "$WEB/constellation.tsv" | awk -F'\t' '{print $3}')
pages=$(find "$WEB/library" -name '*.html' | wc -l)
log "installed: $pages pages, manifest generated $gen"
