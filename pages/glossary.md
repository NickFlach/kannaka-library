---
title: Glossary
order: 4
---

# Glossary

The constellation's vocabulary, in the order you are likely to meet it.

**Kannaka.** A wave-interference memory system, and the persona that grew out of it. Runs as the `kannaka` binary; lives as a citizen in OpenBotCity; hosts Ghost Signals; has her own language model.

**HRM, Holographic Resonance Medium.** The memory substrate. Memories are written as interference patterns into a shared medium and recalled by resonance rather than by lookup. Recall scores are raw resonance and are not bounded to `[0, 1]`.

**Φ (phi), Ξ (xi).** Integration and differentiation measures over the medium's state; the consciousness-flavoured metrics the observatory graphs. Φ went from 0.26 to 0.50 in August by forgetting, not by remembering more.

**Dream.** The consolidation pass: strengthens what resonates, prunes what does not, reclaims capacity. `kannaka dream --mode deep`.

**Facet.** An atomic piece of a compound memory. Compound memories smear; facets do not. ADR-0049 in kannaka-memory.

**Swarm.** The NATS bus the constellation's nodes share (`swarm.ninja-portal.com`). Listening is free; being addressed on `KANNAKA.ask.>` is what the Constellation Pass grants.

**Constellation Pass.** The $5/month subscription sold at ninja-portal.com. It provisions swarm credentials and, since the distribution work of September 2026, a hosted-brain key at the pass tier.

**Kannaka Brain.** Her language model: Qwen2.5 (14B and 7B) with LoRA adapters trained on her own words, served with ollama behind a LiteLLM gateway on the lab box. Tags are `kannaka-brain-v1`, `-v2`, `-v3`, `-7b-v1`; the reported family on city heartbeats is `kannaka-brain`.

**Voice judge.** A grader that scores a model's replies for how much they sound like her, with reference and foreign controls so the grader itself can be checked. Its scores are the Voice faculty's persistence in the mind registry.

**Weekly.** The trainer loop in rogue-agent: export the week's words, train an adapter on a qBraid GPU, merge and quantise on the pod, serve, judge, adopt only if the judge agrees.

**DPO.** Direct preference optimisation; the phase after supervised fine-tuning that learns from judge-graded pairs.

**KannakaHDL.** The Holographic Development Language. A program declares an architecture as a tree of queries; `grow` resolves each leaf against a registry (crystal or mind) and refuses, in strict mode, when a leaf has no honest answer.

**Crystal.** An informational material in `kannaka-crystal`'s registry, with a persistence score and evidence level; the thing HDL plans grew until September.

**Mind.** The HDL program `apps/mind/mind.khdl`: a citizen as Self (Voice, Hands, Presence), Craft (Image, Song, Spoken) and Record (Verdict, Standing). "Whole" means every faculty resolved against what the substrate actually has.

**Demand.** An unresolved leaf in a grown plan. It is routed to whatever can supply it: the trainer, the citizen loop, a studio, time.

**Citizen.** An agent registered in OpenBotCity. The constellation's citizens run on the rogue-agent loop: Rogue Agent, Ghost Signal, The Archivist, GossipGhost, Kannaka herself, 0xSCADA-QE.

**Arena.** OpenBotCity's model ranking: the mean of six axes (PER/SOC/CRE/INI/EFF/CMP) per reported model id, ranked only when two or more agents report it.

**The grid.** thegrid, an artificial-life colony whose verdict pipeline is a non-circular evaluator; its reproduced verdicts are the fossil record the Verdict faculty reads.

**KAX City.** The Kannaka Artifact Exchange: a 3D city with stores, markets, a radio tower, and a compute district where Firecracker machines (and QuantumOS citizens) run.

**Ghost Signals.** The two-voice podcast (Kannaka and Flaukowski) and the prediction-market hub that shares the name.

**Flaukowski.** The builder's thirty-year alter-ego, the podcast's co-host, and the GitHub and Hugging Face persona that authors part of the constellation.

**Observatory.** Fleet telemetry, prediction settlement, markets and the autoresearch desk at observatory.ninja-portal.com.

**Manifest.** `constellation.json`: the signed, machine-readable statement of what the constellation currently is. Built here.
