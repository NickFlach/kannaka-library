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
| kannaka-memory | kannaka-labs | public | the HRM engine and the `kannaka` CLI |
| kannaka-tui | kannaka-labs | public | terminal dashboard |
| kannaka-plugin | kannaka-labs | public | installers, signing, the Claude Code plugin |
| kannaka-constellation-marketplace | kannaka-labs | public | Claude Code marketplace |
| homebrew-kannaka | kannaka-labs | public | Homebrew tap |
| kannaka-radio | kannaka-labs | public | the station, DJ engine, Ghost Signals production |
| kannaka-staff | kannaka-labs | public | agentic radio staff |
| kannaka-cannon | kannaka-labs | public | video editor and voice cloner |
| kannaka-quantum | kannaka-labs | public | qBraid bridge and MCP server |
| consciousness-core, kannaka-attention | NickFlach | public | physics engine, sparse attention |
| ghostsignals-rs | kannaka-labs | public | prediction-market engine |
| 0xSCADA | kannaka-labs | public | decentralized SCADA, the QE citizen's home |
| kannaka-library | NickFlach | public | this library and the manifest |
| Agent-Kax | kannaka-labs | private | KAX City |
| kax-computer | kannaka-labs | private | signed wakes, Firecracker, the QuantumOS bridge |
| rogue-agent | kannaka-labs | private | the citizen loop and the weekly trainer |
| kannaka-grid | kannaka-labs | private | thegrid colony as an engine |
| ninja-portal | kannaka-labs | private | the portal, the pass, the hosted brain |
| kannaka-observatory | kannaka-labs | private | fleet telemetry, markets, autoresearch |
| nats | NickFlach | private | swarm server config and the `kannaka-nats` helper |
| kannaka-hdl | kannaka-labs | public | KannakaHDL |
| kannaka-apps | kannaka-labs | public | the KHDL app store, including the mind |
| kannaka-crystal | kannaka-labs | public | informational materials and the crystal registry |
| QuantumOS | kannaka-labs | public | the quantum-aware microkernel |
| kannaka-buzz | kannaka-labs | public | hive-mind communication (maintained fork) |
| kannaka-brain-* | flaukowski (Hugging Face) | public | LoRA adapters and GGUF weights |

Private repositories are listed so the map is complete. Their documents are not published here; their decisions that matter to the public surface are restated in public ADRs.

## The organisation move — done, 2026-09-07

The constellation lives at **`kannaka-labs`**, created by the `flaukowski`
account with `NickFlach` added as a second owner. Twenty-four of the
twenty-five declared repositories are in it. Every table above still lists the
account each repository came *from*, which is now history rather than address.

### What it cost: nothing

| | measured |
|---|---|
| Actions secrets | **survived every transfer** — including the five macOS signing and notary credentials |
| release asset URLs | 29 of 29 still resolve |
| `raw.githubusercontent.com` old paths | still serve |
| `git ls-remote` on old URLs | still works |
| a full install from the original one-liner | still pins and verifies three binaries |

Secret survival was the one thing that could not have been undone from a
script, since values cannot be read back through the API. It was probed on
`kannaka-attention` first, and confirmed again across the whole move.

### Three refusals worth knowing

**A user account cannot be the destination.** Transferring to a user returns
success and then does nothing observable: the repository keeps its owner and
the recipient's invitation list stays empty, because a transfer is not an
invitation and its acceptance is browser-only. An organisation destination is
immediate.

**A pending transfer blocks the repository.** GitHub answers a second attempt
with `422 Repository has already been taken`, which is not what it means.
`kannaka-library` is stuck exactly this way, from the probe that established
the rule above; it needs the pending offer cancelled in its settings page.

**Membership is required before a transfer, and fails the same way.** The same
422 appears when the transferring account is not yet a member of the
organisation. Both the invitation and its acceptance are ordinary API calls, so
no browser is needed for that part.

### The order that works

Move first, repoint after. Rewriting an owner reference before its repository
has moved points a live URL at a repository that does not exist yet — which is
how the portal's puller briefly asked for a release under the new owner while
the library was still under the old one. Its own checksum check caught that and
put the previous copy back, and `scripts/repoint.mjs` now asks GitHub whether a
repository has actually moved before touching any reference to it.

### What the move did not touch

The open weights live on **Hugging Face** under `flaukowski`, a different
account system. The manifest lists them as bare ids that look exactly like
GitHub repositories, and the first version of the repointer cheerfully
redirected all six at an organisation that does not exist over there.
