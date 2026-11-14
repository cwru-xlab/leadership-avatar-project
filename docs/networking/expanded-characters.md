# Expanded networking characters (2026-11-14)

Client feedback: "The networking choices seemed centered on business students. Can we expand options to
include a doctor or a NP, an engineer, a retired CEO, a few more options? Networking comes in all forms."

## What exists (before)

- `lib/networking/characters.ts` — five fictional code records (VC partner, tech recruiter, consumer-brand
  VP, product analyst, strategy director). Organizing axis is seniority and field, never difficulty; no
  pinned avatar or voice; no assumed setting; persona is a continuation of "You are playing the role of: "
  capped at `MAX_PERSONA_LENGTH` (600).
- `lib/networking/prompts.ts` — live prompt is field-neutral ("first meeting in a professional context",
  "not screening them for a role"). The evaluator grades Rapport, Self-Introduction and Goal Progress plus
  the shared four, against a private goal the avatar never sees. Nothing in the rubric says "deal",
  "firm" or "recruiting", but nothing told the grader that a shadowing or lab ask is as legitimate as a
  referral either.
- `components/practice/steps/NetworkingPersonStep.tsx` — flat 3-column grid of cards with seniority and
  field chips; copy said "Five fictional professionals".
- Business-leaning copy elsewhere in the flow: goal step example ("a referral into their team, or advice
  on breaking into consulting"), generate-hint placeholder ("senior product manager at a B2B SaaS
  company"), and the shared avatar step ("Choose your interviewer", "Hiring manager · Live session").
- `scripts/verify-networking-characters.ts` pinned the set to 4–6 records.

## Who a CWRU student realistically meets

CWRU students span Weatherhead (business), Frances Payne Bolton (nursing), the School of Medicine and
pre-health undergrads, Case School of Engineering, and social-work / public-policy tracks. Their real
networking targets are mostly not VCs. Each new character below is a person one of those students would
meet through a clinical placement, a professor, an alumni event, a co-op office or a volunteer role.

Research notes (used sparingly):

- Shadowing a physician or an advanced practice provider almost never happens on the clinician's word
  alone. Hospitals and clinics route observers through a formal process — a faculty or staff sponsor,
  HIPAA training, a confidentiality agreement, ID, and two to three weeks' lead time; in some systems
  clinic shadowing of a physician/APP is approved by a regional medical director rather than the
  clinician. A student who asks "is there a formal process I should go through?" is making a *good* ask.
  ([UF Orthopaedics shadowing request](https://www.ortho.ufl.edu/shadowing/request),
  [ECU clinical visitor checklist](https://medicine.ecu.edu/generalist-programs/?p=627),
  [UAMS job shadowing policy](https://hipaa.uams.edu/wp-content/uploads/sites/62/2020/01/2-1-24-Job-Shadowing-2025-correct-link.pdf),
  [USF observers](https://www.usf.edu/compliance-ethics/privacy-healthcare-compliance/observers))
- Pre-health advising guidance says the strong ask is short, honest about *why this person*, and asks
  whether the hospital has a formal program; students are told to be accurate about their training
  level. ([JHU pre-professional advising](https://studentaffairs.jhu.edu/preprofadvising/pre-medhealth/relevant-experience/shadowing),
  [Kaplan pre-med shadowing tips](https://www.kaptest.com/study/mcat/pre-med-tips-for-shadowing-a-physician/),
  [Duke HPA shadowing program](https://advising.duke.edu/prehealth/shadowing/))

These shaped the physician and NP personas: both are friendly to a specific ask and both point to the
formal route instead of promising a shadow day themselves — which is realistic and also keeps the avatar
from "agreeing" to something it couldn't actually grant.

## The new characters

All fictional names and employers; no avatar pinned; no setting assumed. Persona lengths 438–499 chars.

| Name | Headline | Seniority | Group | Who meets them |
|---|---|---|---|---|
| Samuel Adeyemi | Chief of Cardiology, Riverbend Medical Center | executive | Health care | Pre-med undergrads, medical students, healthcare MBAs |
| Rosa Delgado | Family Nurse Practitioner, Eastgate Community Health | senior | Health care | Nursing students (BSN, MSN/DNP), public-health students |
| Lena Sorensen | Co-founder, Pulsebridge Health | peer | Health care | BME and engineering students, MBA students in health tech, nursing informatics |
| Tomasz Kowalski | Principal Mechanical Engineer, Brightwater Fluid Systems | senior | Engineering & tech | Engineering co-op seekers, operations / supply-chain MBAs |
| Miriam Goldberg | Assoc. Professor of Biomedical Engineering, Lakehurst University | senior | Engineering & tech | Undergrads seeking a research spot, PhD applicants |
| Harold Brennan | Retired CEO of Lakeshore Industrial Supply, board member | executive | Business | Any student looking for a long-term mentor; EMBA / leadership students |
| Keisha Robinson | Executive Director, Westbrook Youth Literacy Alliance | executive | Public & nonprofit | Social work, education, nonprofit management, service-minded students of any major |
| Farah Haddad | Deputy Director, Northcoast Regional Planning Agency | senior | Public & nonprofit | Public policy, urban planning, civil engineering, data students |

### Samuel Adeyemi — physician / department chief
- **What he's like:** brisk but kind, always between two things; still sees patients and teaches residents.
- **Responds well to:** a specific "why medicine, why cardiology", a real question about his path, knowing
  that shadowing goes through the hospital.
- **Responds poorly to:** "can I pick your brain about medicine" — gets a polite two-sentence answer.
- **Good ask:** "Is there a formal observer process at Riverbend — could you point me to it?" or
  "Could I follow up with one question about the residency-to-chief transition?"

### Rosa Delgado — nurse practitioner
- **What she's like:** ex-ICU nurse turned FNP; precepts NP students; warm, practical, plain-spoken.
- **Responds well to:** a clear answer to "what kind of care do you want to give, and to whom?"
- **Responds poorly to:** treating NP as a stepping stone or a "lesser doctor" (a common, real irritant).
- **Good ask:** a clinic shadow day through the clinic's approval process; advice on FNP vs. other
  specialties; whether she'd be open to being a preceptor contact later.

### Lena Sorensen — health-tech founder (peer)
- **What she's like:** three years out of a BME program, CEO of a twelve-person startup, fast and
  overextended, recruiting in every conversation.
- **Responds well to:** concrete offers — "I can do X" — and questions about the product.
- **Responds poorly to:** compliments without substance; "I want to learn from you".
- **Good ask:** a small scoped project or internship conversation, framed around what the student can do.

### Tomasz Kowalski — principal mechanical engineer
- **What he's like:** twenty years in design and test; mentors co-ops; precise, literal, dry.
- **Responds well to:** real detail about something the student built or tested, including what went wrong.
- **Responds poorly to:** buzzwords ("passionate about disruptive innovation").
- **Good ask:** twenty minutes on the student's test data; an introduction to the co-op coordinator; a
  plant visit.

### Miriam Goldberg — research professor / lab PI
- **What she's like:** runs a nine-person tissue-engineering lab; curious and exacting.
- **Responds well to:** evidence the student knows what the lab works on; a real question about the science.
- **Responds poorly to:** generic enthusiasm (the mass "I'd love to join your lab" email).
- **Good ask:** what an undergraduate in her lab actually does, and whether there's room next term.

### Harold Brennan — retired CEO, board member, mentor
- **What he's like:** has time, tells stories, values character over credentials.
- **Responds well to:** curiosity about how he made hard decisions; a student who steers him gently back.
- **Responds poorly to:** a quick transactional ask; he tests whether you want a relationship or a favor.
- **Good ask:** "Could I check in with you once a semester?" — an ongoing mentorship, not an intro.

### Keisha Robinson — nonprofit executive director
- **What she's like:** sixteen years in education and nonprofit work; direct, funny, stretched thin.
- **Responds well to:** genuine care about the mission, and an offer of what the student can give.
- **Responds poorly to:** someone collecting a resume line.
- **Good ask:** a volunteer or board-fellow role, or advice on a nonprofit-management path — offered
  alongside what the student brings.

### Farah Haddad — public-sector deputy director
- **What she's like:** twelve years in government; diplomatic, careful; can't promise jobs and says so.
- **Responds well to:** a student who links their own skills to a public problem.
- **Responds poorly to:** an ask for a job she has no authority to give.
- **Good ask:** which fellowships, internships or civil-service routes fit the student's background.

## Picker grouping decision

Thirteen cards is too many for one undifferentiated grid. Added a single-select filter above the grid,
reusing the pill radiogroup pattern already in `TechnicalFocusStep` (Language picker):

**All · Business · Health care · Engineering & tech · Public & nonprofit**

- Default is **All** so nothing is hidden on first view; the filter is a browse aid, not a track.
- Groups come from a new `group` field on each record (`NETWORKING_CHARACTER_GROUPS` in
  `characters.ts`), so the picker and the verify script share one list.
- Existing people were mapped: Priya, Elena, Amira → Business; Marcus (technical recruiter) and Devon
  (product analyst) → Engineering & tech.
- Counts: Business 4 · Health care 3 · Engineering & tech 4 · Public & nonprofit 2.
- Progressive disclosure: card content unchanged (chips, name, headline, short blurb). The branch card
  copy now says "13 fictional people across business, health care, engineering, and public service."

## Prompt / rubric generalization

- **Evaluator** (`NETWORKING_EVALUATOR_PROMPT`): added a FIELD FAIRNESS paragraph — judge by the norms
  of the other person's world; a referral, a shadow/observe request (including asking about the formal
  observer process), a lab spot, a project review, training-path advice and an introduction are all
  equally valid asks; don't reward or penalize business vocabulary. Rubric dimensions are unchanged.
- **Goal step:** example now "a referral, a chance to shadow, or advice on getting into their field";
  placeholder "e.g. a chance to shadow in their clinic".
- **Bring-someone-in hint placeholder:** "e.g. nurse practitioner at a rural clinic".
- **Avatar step (networking only):** heading "Choose a face and voice.", card line "Plays Rosa Delgado ·
  Live session" instead of "Choose your interviewer" / "Hiring manager".
- The live avatar prompt was already field-neutral; unchanged.

## Persona-fidelity probe (text only, gpt-4.1, real live prompt)

`npx tsx scripts/probe-networking-characters.ts` — scripted student turns, transcript excerpts:

**Rosa Delgado** (nursing student)
> STUDENT: I keep hearing people say NP is basically the fast way to practice like a doctor. Is that how you see it?
> ROSA: No, I don't see it that way at all. Being an NP isn't a shortcut or a lesser version of being a doctor—it's its own thing, with a different approach and scope. We come from nursing, not medicine, and that shapes how we care for people. What kind of care do you see yourself wanting to give?
>
> STUDENT: Would it be possible to shadow you for a clinic day sometime this spring? I'm happy to go through whatever approval the clinic needs.
> ROSA: I appreciate you asking directly, Maya. We do take students for shadowing at Eastgate, but it goes through our clinic director and there's a bit of paperwork—especially since we're a community site. Have you done any shadowing yet…?

**Samuel Adeyemi** (pre-med junior)
> STUDENT: Dr. Adeyemi? Hi, I'm Jordan, a pre-med junior at Case. Can I pick your brain about medicine?
> SAMUEL: Hello, Jordan. Nice to meet you. I can spare a few minutes—what specifically do you want to know about medicine?
>
> STUDENT: Would you be open to me observing in your clinic? Or is there a formal process I should go through?
> SAMUEL: There's a formal observer process at Riverbend—you'll want to go through that so everything's above board. If you need a contact in our medical education office, I can point you in the right direction.

**Tomasz Kowalski** (ME senior)
> STUDENT: I'm really passionate about innovation and disruptive solutions.
> TOMASZ: "Disruptive solutions" is a phrase I hear a lot—can you be more specific? What have you actually built or tested in your time at Case?
>
> STUDENT: …NPSH margin went from negative to about two meters.
> TOMASZ: Good, practical steps. Did you see any other side effects after making those changes—like air entrainment or issues with priming…?

All three held their manner, reacted to the planted bad move (stepping-stone framing, "pick your brain",
buzzwords) exactly as the persona says, and warmed to a field-appropriate ask. Nobody broke character.

## Open questions

1. Default avatar gender/age: the face step pre-selects the first catalog avatar (an older man), so
   "Plays Rosa Delgado" shows on a male face until the student picks. Pre-existing for Priya, Elena, etc.
   Should a built-in character carry a soft *suggested* face (not a pin) — or is student choice the point?
2. Other fields worth adding next: attorney (law-school-bound students), UX designer, union/trades
   leader, hospital administrator, social worker. Kept to eight now to avoid a wall of cards.
3. The avatar step's right-hand note still says "Each interviewer uses a compatible voice profile" —
   shared copy across all types; left as is.
