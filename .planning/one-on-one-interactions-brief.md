# Source brief: Pitches, Difficult Conversations, Networking Practice

**Provenance:** user-supplied PDF, "Practice Pitch | Difficult Conversations |
Networking Practice Initial Plan Prompts", handed over on 2026-10-02 via
`/gsd:add-phase`. Text extracted from the PDF and reproduced below with the
original structure. This is the source of record for Phases 13-16; where a
roadmap success criterion and this brief disagree, this brief is the intent.

## General task to address

Currently there are placeholders for three separate features: **practice
pitches**, **difficult conversations**, and **networking practice**. Begin
developing each of those now, structured around the same one-on-one conversation
structure already used in the interview feature, just with different prompting
for avatar behavior and for the feedback reports.

> "My understanding is that any one-on-one interaction can be distinctly
> configured through the parameterized http requests, that would send prompts and
> general structure without having to rebuild or duplicate the infrastructure
> from scratch for each distinct type of one-on-one conversation."

This premise is what Phase 13 exists to make true.

## Practice Pitches

Two types, as sublayers of "practice pitches."

### 1. Elevator pitches
- Strict 30-60 second pitch. No visual document or interactive feature attached,
  beyond the usual one-on-one avatar conversation.
- The user has to deliver the pitch as quickly as possible through words only,
  then field follow-up questions.
- Users should be rewarded for quickly getting to know the other person and
  something about them to find common ground, then relating the pitch to that
  person's specific interests and perspectives — selling the product to that
  specific person, not just selling the product generally.
- The avatar's follow-up questions should be tailored to how engaged the user has
  made the avatar. A drawn-out, tedious, unrelatable pitch makes the avatar less
  interested, may show in their response, and may trigger a more abrupt end to
  the conversation — a failure.
- A better pitch is more concise, gets all the important information out, and
  leaves room for follow-up questions. An interesting, engaging, relatable
  initial pitch should encourage the avatar to ask follow-ups.

### 2. Investor pitch deck
- The user uploads a slide deck in advance as PowerPoint, Google Slides, or PDF.
  If a PDF, the app should check that it fits the right format.
- The user should be clear up front about what they want from the investor, then
  defend that claim through the rest of the pitch with evidence.
- The user can see and click through the pitch deck in live time. Their topical
  discussion should correlate with what is on the slides, unless a question leads
  elsewhere. **The avatar must not see or reference information that has not been
  surfaced yet** — if slide 10 covers a subject and the user is on slide 4, the
  avatar must not ask about slide 10's content as if it already knows it.
- The user is graded on vocal pitch performance and also on the structure and
  content of the deck. Overly wordy decks, or unstructured/poor-looking slides,
  are penalized.
- Professionalism is key.
- The investor negotiates on terms; the user should manage the negotiation and
  meet the investor at an optimal price and percentage.
- Time-sensitive: 20-30 minutes based on number of slides, pre-selected.

## Difficult Conversations

Role-specific — the avatar should completely assume the stated role and behave
accordingly. Examples:

1. Confronting a low-performing team member
2. Firing a team member
3. Asking a manager for a raise, or confronting them about a problem
4. Confronting a professor over an unfair grade
5. Etc. — reasonable additions welcome

Users should be able to create their own iterations as well, and publish to share
across all users.

## Networking Practice

The user should be able to bring in a description of somebody they want to
practice networking with — LinkedIn text, written text, or AI-generated text — or
pick from default characters.

## Decisions taken at add-phase time (2026-10-02)

- **Phase split.** Four phases, not one: Phase 13 generalizes the one-on-one
  engine; Phases 14, 15 and 16 are the three features on top of it. Chosen by the
  user over a three-phase (one per feature) and a single-phase split, because the
  brief's own premise is that infrastructure is not duplicated per type.
- **Deck formats.** All three — PDF, PPTX and Google Slides — are in scope for
  Phase 14's first pass, chosen by the user over a PDF-only first pass. Google
  Slides implies a Drive OAuth scope, token storage and a Drive API read.

## Open questions for `/gsd:discuss-phase`

These are not yet decided and were not in the brief:

- Elevator pitch: what is being pitched — the student themselves, a product, a
  startup? Does the student declare it up front, or is it a configured parameter?
- How is "the avatar ended the conversation early" surfaced on the report so it
  reads as feedback rather than as a crash?
- Investor negotiation: is there a target valuation the engine scores against,
  and who sets it — the student's ask, or the configured scenario?
- Difficult conversations: do published scenarios need moderation, given Phase 11
  removed staff roles from the student path?
- Networking: does a pasted LinkedIn profile of a real person raise a consent or
  retention constraint worth stating before it is stored?
