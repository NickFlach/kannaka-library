# kannaka-library

The constellation, in one place: a library of every public document across the Kannaka repositories, and the signed manifest that says what the constellation currently is.

- Library: https://ninja-portal.com/library/ (mirror: https://nickflach.github.io/kannaka-library/)
- Manifest: https://ninja-portal.com/constellation.json (+ `.sig`, public key `manifest.pub`)

## What is here

| path | what |
|---|---|
| `sources.json` | the constellation declared once: components, layers, repos, release assets, docs globs, services |
| `scripts/build-manifest.mjs` | resolves each component's latest release, records assets + sha256, merges the brain registry, signs → `dist/constellation.json` |
| `scripts/build-library.mjs` | clones the public repos, renders their docs, builds the ADR index and search → `site/` |
| `scripts/lib/md.mjs` | a dependency-free Markdown renderer |
| `scripts/lib/keys.mjs` | ed25519 keygen / sign / verify for the manifest |
| `pages/` | cross-cutting wiki pages (overview, distribution, accounts, glossary, contributing) |
| `brain/registry.json` | served brain tags with perplexity and judge scores, exported by the trainer |
| `.github/workflows/build.yml` | tests, builds, signs, publishes to GitHub Pages on push and nightly |

No dependencies beyond Node 20 and git.

```sh
node --test test/
node scripts/build-manifest.mjs            # dist/constellation.json (+ .sig when a key is present)
node scripts/build-library.mjs             # site/
node scripts/build-library.mjs --only kannaka-hdl,kannaka-apps   # while editing a page
```

## Signing

```sh
node scripts/lib/keys.mjs keygen           # ~/.kannaka/keys/constellation-manifest.pem + manifest.pub
node scripts/lib/keys.mjs verify dist/constellation.json dist/constellation.json.sig manifest.pub
```

The Actions build signs with the `MANIFEST_SIGNING_KEY` secret (the PEM). A build on `main` fails if it cannot sign.

## Adding a document

Put it in the owning repository (`docs/`, or `docs/adr/` for a decision) or in `pages/` here; register a new component in `sources.json`. See the [contributing page](pages/contributing.md).

## License

Space Child License v1.0. Documents rendered from other repositories keep their own licenses.
