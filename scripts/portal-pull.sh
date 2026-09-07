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

# cron runs this with PATH=/usr/bin:/bin, which does NOT contain restorecon
# (/sbin). The first version guarded the relabel with `command -v restorecon`,
# so under cron that guard turned a hard requirement into a silently skipped
# nicety: a hand-run at 18:30 served fine and the 20:23 cron run 403'd every
# page while reporting success.
PATH="/usr/sbin:/sbin:/usr/bin:/bin:$PATH"

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

# SELinux: a tree that arrived via /tmp carries user_tmp_t and nginx is refused
# every file in it — 403 on every page, with a directory on disk that looks
# perfectly correct. Same trap as /usr/local/bin/nats.
if [ "$(getenforce 2>/dev/null || echo Disabled)" != "Disabled" ]; then
  restorecon -RF "$WEB/library" >/dev/null 2>&1 || die "restorecon failed while SELinux is enforcing"
  ctx=$(ls -dZ "$WEB/library" | awk '{print $1}')
  case "$ctx" in
    *user_tmp_t*) die "library is still labelled $ctx — nginx would 403 every page" ;;
  esac
fi
for f in constellation.json constellation.json.sig constellation.tsv constellation.tsv.sig manifest.pub; do
  install -m 0644 "$f" "$WEB/$f"
done

# The only check that matches what a reader experiences: ask nginx for the page
# over HTTP. Permissions, SELinux labels and vhost config are all upstream of
# this answer and none of them were asserted before — the previous version
# logged "installed: 190 pages" while every one of those pages was a 403.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
  --resolve 'ninja-portal.com:443:127.0.0.1' https://ninja-portal.com/library/index.html 2>/dev/null || echo 000)
if [ "$code" != "200" ]; then
  log "SERVED CHECK FAILED: nginx answered $code for /library/index.html — rolling back"
  rm -rf "$WEB/library"
  [ -d "$WEB/library.old" ] && mv "$WEB/library.old" "$WEB/library"
  die "the new library was not servable; the previous one is back in place"
fi
rm -rf "$WEB/library.old"

gen=$(head -1 "$WEB/constellation.tsv" | awk -F'\t' '{print $3}')
pages=$(find "$WEB/library" -name '*.html' | wc -l)
log "installed and SERVING: $pages pages (nginx answered 200), manifest generated $gen"
