---
name: Voice takeoff workflow
description: Greg's required primary recording flow and browser limitation.
---

The on-screen Fulcher “LET’S TAKEOFF!” microphone button is the primary workflow
in the installed iPhone app. Keyboard dictation must not replace it; Manual Entry
is a separate option.

**Why:** The user explicitly corrected the keyboard-first browser fallback and
requested actual native WhisperKit recording from the prominent button.

**How to apply:** Keep the Fulcher logo, navy oval microphone CTA, red accent and
separate Manual Entry, Saved Jobs, Results and Settings tiles. The browser must
explain the installed-app requirement and must never simulate listening when
the native plugin is unavailable.

Recording collects recognized text for Stop → review/edit → Process measurements.
Retain the selected job and section, and do not add measurements automatically as
streaming segments arrive.

**Why:** The user asked to review and process the stopped transcript without losing
job or section context.

**How to apply:** Keep microphone/listening status based on native events, retain
unsaved text on errors, and treat the actual iPhone recording experience as a
separate hardware verification from mocked bridge tests.
