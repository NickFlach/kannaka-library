---
title: Accounts and repositories
order: 3
---

# Accounts and repositories

The constellation is spread over two GitHub accounts and one Hugging Face account. This page is the honest map; the [manifest](../manifest.html) is the machine-readable one.

## Why two accounts

`NickFlach` is the builder's account: the memory engine, the radio, the city, the portal, the installers, the fleet. `flaukowski` is the builder's alter-ego and the constellation's author persona: the language (`kannaka-hdl`, `kannaka-apps`, `kannaka-crystal`), QuantumOS, the brain's open weights on Hugging Face, and the commit identity on the story-facing work. Some repositories were created under the persona because it was signing the work at the time; nothing deeper than that.

Both accounts are collaborators on each other's repositories, so a plain `git push` works from either. What the split costs is coherence: installers, the tap, the marketplace and CI each had to know which owner held which release. The manifest removes that cost; the organisation move, when it happens, removes the split.

## What lives where

| repository | owner | visibility | what it is |
|---|---|---|---|
| kannaka-memory | NickFlach | public | the HRM engine and the `kannaka` CLI |
| kannaka-tui | NickFlach | public | terminal dashboard |
| kannaka-plugin | NickFlach | public | installers, signing, the Claude Code plugin |
| kannaka-constellation-marketplace | NickFlach | public | Claude Code marketplace |
| homebrew-kannaka | NickFlach | public | Homebrew tap |
| kannaka-radio | NickFlach | public | the station, DJ engine, Ghost Signals production |
| kannaka-staff | NickFlach | public | agentic radio staff |
| kannaka-cannon | NickFlach | public | video editor and voice cloner |
| kannaka-quantum | NickFlach | public | qBraid bridge and MCP server |
| consciousness-core, kannaka-attention | NickFlach | public | physics engine, sparse attention |
| ghostsignals-rs | NickFlach | public | prediction-market engine |
| 0xSCADA | NickFlach | public | decentralized SCADA, the QE citizen's home |
| kannaka-library | NickFlach | public | this library and the manifest |
| Agent-Kax | NickFlach | private | KAX City |
| kax-computer | NickFlach | private | signed wakes, Firecracker, the QuantumOS bridge |
| rogue-agent | NickFlach | private | the citizen loop and the weekly trainer |
| kannaka-grid | NickFlach | private | thegrid colony as an engine |
| ninja-portal | NickFlach | private | the portal, the pass, the hosted brain |
| kannaka-observatory | NickFlach | private | fleet telemetry, markets, autoresearch |
| nats | NickFlach | private | swarm server config and the `kannaka-nats` helper |
| kannaka-hdl | flaukowski | public | KannakaHDL |
| kannaka-apps | flaukowski | public | the KHDL app store, including the mind |
| kannaka-crystal | flaukowski | public | informational materials and the crystal registry |
| QuantumOS | flaukowski | public | the quantum-aware microkernel |
| kannaka-buzz | flaukowski | public | hive-mind communication (maintained fork) |
| kannaka-brain-* | flaukowski (Hugging Face) | public | LoRA adapters and GGUF weights |

Private repositories are listed so the map is complete. Their documents are not published here; their decisions that matter to the public surface are restated in public ADRs.

## The organisation move

The organisation is **`kannaka-labs`**. The name was free on GitHub and already
reads as the constellation's institution rather than one of its products: the
observatory's prediction registry files claims under Kannaka Labs today.

`scripts/org-move.mjs` runs the move. It exists because a transfer is not one
operation with one outcome, and the parts that matter are not all documented
together.

### What GitHub carries, and what it drops

| | after a transfer |
|---|---|
| clone / fetch / push over HTTPS and SSH | redirected to the new owner |
| release download URLs | redirected |
| issues, pull requests, wiki, stars, watchers | carried |
| **Actions secret values** | **cannot be read back through the API at all** |
| GitHub Pages | the site URL changes owner |

That fourth row is the whole reason this is done one repository at a time.
Twelve secrets live across six repositories, and five of them are the macOS
signing certificate and notary credentials in `kannaka-plugin`. A secret that
does not survive a transfer must be typed in again by whoever holds the
original, and nothing can read it out first to check.

So the move measures instead of assuming. `--probe` records secrets,
variables, environments, webhooks, Pages and stars, transfers one repository,
reads all of it again, prints what was lost by name, and then tests every URL
shape against the **old** address. It exits non-zero if anything did not
survive.

### The order

1. **Create the organisation** at [github.com/organizations/plan](https://github.com/organizations/plan). This is the only step with no API on github.com; everything after it is scripted.
2. **Probe** with `kannaka-library`: one secret whose value is held elsewhere, a Pages site, a release, and a live consumer in the portal's puller. If anything is going to break, it breaks on the least load-bearing repository in the estate.
3. **Move the public repositories** (19), rebuild the manifest, and walk every asset URL in it.
4. **Move the private ones** (6) — these carry live deployments, so they follow only once the public move is proven.
5. **Repoint what hardcodes an owner.** `sources.json` is repointed by the script; the rest is small and known: the installers' `ReleaseRepo`/`TuiRepo` defaults, their `raw.githubusercontent.com` self-URL, the `kannaka-hdl` component they pin, `claude plugin marketplace add`, the manifest's own install URLs, and the Homebrew tap's formula.

### Two accounts, one more step

Five repositories belong to `flaukowski`, where the `NickFlach` token has push
but **not admin** — and a transfer needs admin. That account's token does have
it. A transfer into an organisation also requires the transferring account to
be a member of it, so `flaukowski` has to be invited from the organisation's
People page; `scripts/org-move.mjs --join` accepts the invitation on its
behalf.

### What the move does not touch

The open weights live on **Hugging Face** under `flaukowski`, which is a
different account system entirely. A GitHub organisation does not move them,
the manifest links them by their full URL, and nothing in the installers
resolves them through GitHub.
