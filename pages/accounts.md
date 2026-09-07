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

When the constellation moves to one GitHub organisation, the sequence is:

1. create the organisation and add both accounts;
2. transfer the public repositories first (GitHub redirects clone and release URLs, and the manifest builder follows the redirect);
3. rebuild the manifest and confirm every asset hash still resolves;
4. transfer the private repositories;
5. update `sources.json` here to the new owner; nothing else has to change.
