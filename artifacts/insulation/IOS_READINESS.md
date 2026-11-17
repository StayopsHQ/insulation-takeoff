# iOS source readiness audit

## Result

Known source issues were corrected and local Capacitor sync succeeded. This is
not an Xcode compilation result: this Linux environment has no Apple SDK,
Swift compiler, signing identity, or physical iPhone. A successful signed iOS
build cannot be certified until the Xcode checks below pass.

## Verification performed

- All Node tests: 45 passed, none failed. Includes parser, calculations, voice
  session handling, browser dictation checks, native source wiring, Worker CORS,
  and removal of the former transcription route.
- Production Vite web build: passed.
- Capacitor local `mobile:sync`: passed, including web asset copying, generated
  native configuration, and SPM wrapper generation. No deployment or D1 command.
- Audited native assets contain the verified HTTPS Worker URL. The browser
  preview was rebuilt afterward without that native URL override.
- The production-aware `mobile:sync:cloudflare` command refused to proceed, as
  designed: the live Worker still returns `Hello world` at `/api/health`.
- The installed Xcode project parser successfully parsed `project.pbxproj` and
  verified both custom Swift files belong to the Sources build phase.
- Parsed Info.plist: microphone usage permission is present.
- Checked Capacitor configuration: bundle ID `com.insulationtakeoff.app`,
  web directory `dist`, no remote `server.url`, native HTTP enabled.
- Installed Capacitor CLI, core and iOS are all 8.6.2; the generated SPM wrapper
  also selects Capacitor 8.6.2 and iOS 16. Both app build configurations use the
  same provisional bundle ID and iOS 16 target.
- Swift SDK APIs were compared directly with Argmax's `v1.1.1` source:
  WhisperKit initialization/download, AudioStreamTranscriber constructor,
  state, start and stop methods. This comparison is not a Swift typecheck.
- Browser/native/Worker source was searched for audio upload paths, Deepgram,
  browser capture and remote transcription calls. None remain in the active
  app. Existing Worker tests confirm the former transcription route is absent.
- JavaScript syntax and whitespace checks passed.

## Issues corrected

1. **Swift initializer argument order:** `load` now precedes `download`, matching
   the SDK's declaration. The previous order was a compilation blocker.
2. **Dependency drift:** the Xcode WhisperKit dependency is now pinned to the
   audited 1.1.1 release rather than accepting any later 1.x release. Transitive
   SPM resolution still needs to run in Xcode.
3. **Offline startup:** first setup explicitly downloads the model, loads it and
   its tokenizer into persistent Application Support storage, then records the
   relative model folder. Subsequent launches pass that folder directly and
   disable model downloading, avoiding an online model listing on every launch.
   The tokenizer uses the same persistent root and SDK local-cache lookup.
4. **Download status:** model downloading now reports the SDK's percentage.
   Model compilation/loading and initial tokenizer setup remain indeterminate.
   The model cache is excluded from iCloud backup.
5. **Duplicate interim text:** a current decode replaces, rather than appends to,
   the active run's earlier unconfirmed text. Confirmed timing boundaries are
   deduplicated even when punctuation changes. Confirmed interim segments are
   removed; genuinely repeated measurements at distinct times/runs are retained.
6. **Stop/start lifecycle:** duplicate starts/model preparation are rejected.
   Stop joins the cancelled stream task before returning its snapshot; the web
   layer drains queued events before handling it. Stream failure releases the
   native stream reference so retry is possible.

## Cloudflare configuration

The intended URL is `https://insulation-takeoff.mleo0705.workers.dev`.
The native audit sync supplied it through `VITE_API_BASE_URL`, and the resulting
native JavaScript bundle was checked for that exact URL. No credentials belong
in this variable.

The existing Worker/D1 binding was previously verified to match the repository.
This audit made only a public health GET request. The live response remains a
placeholder, so production login and job saving are blocked until the existing
Worker source is deployed with approval. No migration is proposed by this audit.
The Replit preview retains its separate local backend.

## Remaining build/install blockers

- Use a Mac image with **Xcode 26.0 or later**, as required by Capacitor 8, plus
  Node.js 22+ and the workspace's pnpm version. A generic older Mac image will
  not suffice.
- Run workspace dependency installation using the checked-in pnpm lockfile,
  then production-aware mobile sync once the Worker health check passes.
  Do not assume the currently generated audit assets are an installable app.
- Resolve Swift packages in Xcode. Repository/network availability, transitive
  dependencies, binary framework compatibility and Swift concurrency/compiler
  diagnostics have not been verified by Linux sync. Save the resolved SPM lock
  after a successful Xcode resolution.
- Select the Apple signing team and confirm a unique bundle ID. Signing
  certificates/profiles and an authorized device or distribution route are
  still required; no signing team is configured in the repository.
- Compile the App target for an iPhone with iOS 16+ and install it. Check
  storyboard/scene launch, custom bridge registration and `WhisperVoice` method
  availability on the real runtime.
- Obtain approval to deploy the existing Cloudflare Worker and verify its JSON
  health response before testing production accounts and persisted jobs.

## Physical-iPhone validation still required

- Allow/deny microphone permission, record, pause/resume, stop and retry after
  failure. Check for stale callbacks and missing/duplicated speech in real ASR.
  Regression tests prevent known event-assembly duplication; they cannot prove
  that the speech model never repeats a word or changes segment boundaries.
- First model/tokenizer download, progress, poor connection, interruption,
  insufficient storage and recovery. The model alone is approximately 626 MB;
  its tokenizer and compilation/loading need additional storage and RAM.
- After successful setup, force-quit and relaunch in airplane mode to verify
  cached model AND tokenizer loading and local transcription. Missing/corrupted
  cache files can require internet again; no unconditional offline guarantee.
- Check the large model's speed, memory use, battery and thermal behavior on
  Greg's particular phone. Long foreground sessions retain audio in memory
  inside the upstream AudioStreamTranscriber; unattended/unlimited recording
  and background recording are not guaranteed.
- Check the last short phrase at Stop. The SDK does not promise a final decode
  of every sub-second microphone buffer. Unconfirmed text is preserved for
  review, not automatically treated as a confirmed measurement.
- Verify native HTTP cookies/login survive subsequent requests; create/edit a
  measurement, reload, sign out and back in, and confirm persistence against
  the intended backend. Shared job saving requires internet; local transcription
  alone does not make the entire app an offline data-entry system.
- Inspect device network traffic if independent runtime proof of no audio
  egress is required. Source inspection found only model/tokenizer downloads
  and application text/data requests, not audio uploads.

## References

- [Audited WhisperKit initializer/download source](https://github.com/argmaxinc/argmax-oss-swift/blob/v1.1.1/Sources/WhisperKit/Core/WhisperKit.swift)
- [Audited streaming implementation](https://github.com/argmaxinc/argmax-oss-swift/blob/v1.1.1/Sources/WhisperKit/Core/Audio/AudioStreamTranscriber.swift)
- [Audited tokenizer cache lookup](https://github.com/argmaxinc/argmax-oss-swift/blob/v1.1.1/Sources/WhisperKit/Utilities/ModelUtilities.swift)
- [Capacitor 8 build prerequisites](https://capacitorjs.com/docs/updating/8-0)

No deployment, production secret changes, D1 queries/mutations/migrations,
paid account creation, or paid build service setup were performed.
