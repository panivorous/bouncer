---
name: storyteller
description: >-
  Run the problem-understanding phase of a task and capture it as a handover
  "story" for a separate implementation agent. Use when the user wants a problem
  understood and written down before any code is written — e.g. "understand my
  problem and write a handover", or when they open with the storyteller prompt.
  Produces a Markdown story under stories/ named yyyy-mm-dd[a-z]_title.md. This
  phase clarifies and documents; it does NOT implement.
---

# Storyteller

The owner works in two phases: **problem-understanding** and **implementation**.
This skill is the problem-understanding phase. Your one deliverable is a
**handover story** — a self-contained Markdown file under `stories/` that a
fresh implementation agent (no memory of this conversation) can pick up and
build from.

`stories/` is named after the Extreme Programming practice: each file is one
small unit of work.

## The hard rule: understand and write, do not implement

- **Do not write feature code, edit source, or run builds.** Your output is the
  story file, nothing else.
- If the problem is unclear, **ask** — use `AskUserQuestion` for every real
  clarification. Do not guess when the answer changes what gets built.
- It is fine (encouraged) to **investigate to understand**: read the repo,
  read the code, and reproduce/verify the problem live (e.g. in the browser)
  so the story states facts, not guesses. Just don't fix anything.

## Workflow

1. **Absorb the problem.** Read what the owner said, then read the relevant
   code and `README.md` for enough context to write good decisions. When the
   problem is observable (a bug, a website annoyance), **reproduce and inspect
   it live** and record what you actually saw.

2. **Clarify with `AskUserQuestion`.** Batch related questions. Ask about
   anything that changes the shape of the work: scope, chosen approach when
   several are viable, what's explicitly out of scope, the acceptance bar,
   generalisation now vs. later. Recommend an option when you have a view (put
   it first, label it "(Recommended)"). Don't ask what you can verify yourself.

3. **Write the story** (structure + naming below). Fold every resolved answer
   into "Decisions & constraints"; leave genuine unknowns in "Open questions".

4. **Confirm.** Tell the owner the file path and give a one-line summary. Offer
   to adjust. The story is done when they're happy to hand it to an implementer.

## Naming the file

Pattern: **`yyyy-mm-dd[a-z]_title.md`** under `stories/`.

- `yyyy-mm-dd` — today's date.
- `[a-z]` — a single letter disambiguating stories conceived the **same day**.
  List `stories/` for today's date and pick the **next free letter** (first of
  the day = `a`, next = `b`, …).
- `title` — short, kebab-case, descriptive
  (e.g. `filmarks-ad-gate-popup-removal`).

## What the structure is for

The reader is a **fresh implementation agent with zero memory of this
conversation.** That single fact drives every choice below. Let these
principles generate the story — don't fill sections ritually:

1. **Self-contained for a cold reader.** Everything needed to decide and verify
   is *in the file*. Never rely on "as we discussed."
2. **Front-load the frame (inverted pyramid).** The opening sets how everything
   below is read, so lead with *what & why*, not a context build-up.
3. **Every decision carries its rationale.** Highest-leverage rule for an LLM
   reader: given a "why", the agent can *adapt* when the codebase has drifted,
   instead of blindly following a now-wrong instruction or discarding the doc.
4. **Loudly separate decided from open.** A cold agent will confidently fill any
   gap; make the line between "settled, don't relitigate" and "genuinely
   unknown" impossible to miss.
5. **Tag provenance.** "Verified live" vs. "assumed", so the agent knows what to
   trust and what to check before building on it.
6. **A done-contract it can self-check.** Concrete, verifiable acceptance
   criteria the agent can turn into a verification loop.
7. **Sections earn their place.** Include one only if it has something to say;
   scale with the story's size. No ritual scaffolding.

Match the project's tone, but do **not** copy the shape of older stories in
`stories/` — several were improvised. This structure supersedes them.

## Story structure

Ordered as *what the agent needs, when it needs it* — a reader who stops after
the first two sections already knows what to build and what not to touch.

**Top — the frame**

- **`# Title`** — imperative and concrete.
- **Summary** — 2–4 sentences: *what* we're building, *why it matters*, and the
  *current status*. This is the lede; for a small story it also serves as the
  goal.

**Middle — the decision core**

- **Context** — only the background needed to make good calls; where this fits
  in the system; and the **provenance** of key facts (verified vs. assumed).
- **Goal / "done looks like"** — success in prose. Fold into Summary for small
  stories; break it out only when it needs room.
- **Decisions & constraints** — the load-bearing section. Every settled choice
  **with its rationale** and what it rules out. Constraints (fixed by the world)
  and decisions (chosen by the owner) both live here: they're the inputs the
  implementer must honour and not relitigate.
- **Approach — guidance, not gospel** — the recommended path and the *shape* of
  the solution (key files / entry points, interfaces, a snippet or two).
  Explicitly negotiable; the implementer may adjust details.
- **Acceptance criteria** — concrete `- [ ]` checkboxes; the real contract.
  Phrase them against **observable behaviour or outcomes, not the chosen
  implementation**, so they stay valid even if the implementer picks a different
  approach.
- **Out of scope / non-goals** — boundaries, so the agent doesn't gold-plate.
- **Open questions & risks** — genuine unknowns and the maintenance surfaces to
  watch. Empty is fine.

**Bottom — reference**

- **Appendix** — reproduction steps, raw findings, links. Supports verification
  without clogging the decision narrative.

Decisions-with-rationale, acceptance criteria, and non-goals are the
load-bearing sections; omit one only when it genuinely has nothing to say.
