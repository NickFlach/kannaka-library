---
title: Distribution
order: 2
---

# Distribution

How the constellation reaches a machine, and the shape it is converging on.

## The surfaces

| surface | what it delivers | source of truth |
|---|---|---|
| `curl … install.sh \| sh` / `install.ps1` | the `kannaka` engine, `kannaka-tui`, `kannaka-hdl`, a Constellation Pass claim, a brain (local or hosted) | [kannaka-plugin](https://github.com/NickFlach/kannaka-plugin) installers |
| Signed `.pkg` / `.msi` | the same, double-clickable; macOS signed and notarised | kannaka-plugin releases |
| `brew install NickFlach/kannaka/kannaka` | the engine only | [homebrew-kannaka](https://github.com/NickFlach/homebrew-kannaka) |
| Claude Code marketplace | the `kannaka` plugin family (memory, radio, cannon, staff, octo) | [kannaka-constellation-marketplace](https://github.com/NickFlach/kannaka-constellation-marketplace) |
| [ninja-portal.com](https://ninja-portal.com) | download buttons, the Constellation Pass ($5/month), the hosted brain and its keys, this library | ninja-portal (private) |
| [ninja-portal.com/brain](https://ninja-portal.com/brain) | open weights for `ollama`, or an OpenAI-compatible endpoint at `/v1` with a free budgeted key | Hugging Face `flaukowski/kannaka-brain-*` + the gateway on the lab box |

## The manifest

Every surface used to hard-code an owner and a `latest`. Now there is one signed document, [`constellation.json`](../constellation.json), built from [`sources.json`](https://github.com/NickFlach/kannaka-library/blob/main/sources.json) on every push and every night:

- each component's **pinned release** (tag, date, URL);
- each asset's **download URL and sha256**, taken from the release's own sidecar;
- the **brain registry**: served tags, base model, served perplexity, the voice judge's score, where the weights are;
- the hosted services and whether the brain is online;
- the canonical install commands.

It is signed with ed25519; the public key is [`manifest.pub`](../manifest.pub). Verify with Node:

```sh
node scripts/lib/keys.mjs verify constellation.json constellation.json.sig manifest.pub
```

or with OpenSSL 3:

```sh
openssl pkeyutl -verify -pubin -inkey manifest.pub -rawin -in constellation.json -sigfile <(base64 -d constellation.json.sig)
```

Installers that read the manifest install a **coherent set**: the versions that were released together and verified together, not whatever each repo's `latest` pointed at when the download ran. A machine that cannot reach the manifest falls back to `latest` and says so.

## Local or hosted brain

The same installer offers both, and the choice is a config, not a fork:

- **Local**: `ollama create kannaka-brain` from `hf.co/flaukowski/kannaka-brain-7b-v1-GGUF` (4.7 GB, runs on a laptop). `kannaka ask` talks to `http://127.0.0.1:11434/v1`.
- **Hosted**: a key from `POST https://ninja-portal.com/api/brain/key`, budgeted and rate-limited by the gateway itself. A Constellation Pass claim mints one at the pass tier in the same step that hands over the swarm credentials.

Either way the result is the `[llm]` section of `~/.kannaka/config.toml`, which is what `kannaka ask` and the mind read.

## The mind

`kannaka-hdl` grows a citizen's mind against a registry of what the machine actually has (see the [mind app](../kannaka-apps/apps/mind/README.html)). On the lab box the registry is built from live probes of the served brains, the citizen loop, the studios and the fossil record. A downloaded constellation grows the same program against a local registry: the configured brain, the citizen's own heartbeat, the keys present, and the fossil record carried in the manifest. An unresolved faculty is demand, and the demand names what to install next.

## One home for the repositories

The constellation lives across two GitHub accounts, `NickFlach` and `flaukowski`, for historical reasons described in [Accounts](accounts.html). The manifest makes the split harmless to installers. The plan when the time comes is a GitHub organisation that both accounts belong to, with the constellation repositories transferred in; GitHub keeps redirects for clone URLs and release download URLs, so nothing already installed breaks.
