---
title: Contributing a page
order: 5
---

# Contributing a page

The library has no editor. A page is a Markdown file in a constellation repository, and the build collects it.

## Put the document where it belongs

- **A decision** goes in the owning repository's `docs/adr/` as `ADR-NNNN-short-title.md` (or `NNNN-short-title.md`; both are recognised). Give it a `# Title` and a line that says `Status: Proposed | Accepted | Superseded | Rejected`. It appears in the [ADR index](../adr.html) with that status on the next build.
- **A guide, runbook, or reference** for one component goes in that repository's `docs/`. Any `docs/*.md` (and `docs/adr/*.md`) of a public component is collected; some repositories list extra paths in [`sources.json`](https://github.com/NickFlach/kannaka-library/blob/main/sources.json).
- **A cross-cutting page**, one that belongs to the constellation rather than to a repository, goes in this repository's [`pages/`](https://github.com/NickFlach/kannaka-library/tree/main/pages). Front matter `title:` and `order:` control the sidebar.
- **A new component** is a new entry in `sources.json`: id, title, repository, layer, a one-line blurb, the release asset names if it ships binaries, and the docs globs. That is the whole registration.

## What the build does with it

Relative links between collected files become library links; links to files that were not collected go to GitHub. Images load from the repository. The first `# heading` is the page title. Front matter is read for `title`, `status` and `order` and otherwise dropped.

The site rebuilds on every push to this repository and every night, so a document merged elsewhere shows up within a day; push here (or run the workflow by hand) to publish sooner.

## Writing for the library

Write for someone who knows the domain and did not watch the work. Say what the thing is, what it decided, and what it costs. Numbers go in tables. A document that only makes sense next to a chat transcript is a note, not a page; keep it with the code.

## Building locally

```sh
git clone https://github.com/NickFlach/kannaka-library
cd kannaka-library
node scripts/build-manifest.mjs          # resolves releases → dist/constellation.json (signed when a key is present)
node scripts/build-library.mjs           # clones the public repos into .cache/ and renders site/
npx serve site                           # or any static server
```

There are no dependencies beyond Node 20 and git. `--only kannaka-hdl,kannaka-apps` restricts a build to a few components while you work on a page.
