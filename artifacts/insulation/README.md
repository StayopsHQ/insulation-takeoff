# Insulation Takeoff

## Replit workspace notes

This original application source is imported as `@workspace/insulation`. The Replit preview runs the browser app and included Worker against a fresh, local-only D1 database. It does not connect to or change the Cloudflare account or database.

- Run the existing unit tests with `pnpm --filter @workspace/insulation test`.
- The Replit preview builds with the original Cloudflare assets configuration, applies migrations to local D1, and starts Wrangler in local mode.
- Set `INSULATION_LOCAL_SETUP_TOKEN` as a Replit secret to create the first local administrator. Set `OPENAI_API_KEY` as a Replit secret for browser transcription. Both are passed to local Wrangler through a short-lived temporary file outside the project.
- The Replit build uses `vite.config.ts`; `pnpm --filter @workspace/insulation run cloudflare:build` builds Cloudflare assets and passes locally.
- Verified Cloudflare target: account `61a8b1da30e9f8e400e25e01988a933f`; D1 `insulation-takeoff` (`f2cad654-4e5e-4c73-b37f-c00255abe614`); Worker `insulation-takeoff` with its `DB` binding pointing to that D1. Its verified URL is `https://insulation-takeoff.mleo0705.workers.dev`.
- The current live Worker responds `Hello world` at `/api/health`, not the JSON health response from this repository's application Worker. Do not build/install a native app against it until the existing Worker source is deployed and `/api/health` returns `{"ok":true,"service":"insulation-takeoff"}`.
- The existing D1 schema matched migration `0001_initial.sql`. Its Wrangler migration ledger was missing, so the existing baseline was recorded and migration `0002_login_rate_limits.sql` was applied after approval. The ledger now records both migrations. Do not recreate the database or reapply the initial schema manually.
- Worker secret names were checked without reading values: `SETUP_TOKEN` is configured. Browser transcription requires an `OPENAI_API_KEY` Worker secret; native WhisperKit transcription remains on-device. No Worker deployment has been performed.

A responsive insulation takeoff app. The browser uses OpenAI's audio transcription API after Greg stops a recording; the signed iOS app continues to use open-source WhisperKit locally. Cloudflare Workers and D1 remain the API and persistent shared data backend.

## Included

- Email/password authentication with PBKDF2 password hashing
- HttpOnly session cookies and administrator-created team accounts
- Same-origin validation for state-changing API requests
- Atomic first-administrator bootstrap to prevent concurrent setup races
- Persistent D1-backed login throttling (20 attempts/IP and 8 attempts/email per 15 minutes)
- Shared jobs and measurement records in D1
- Job sharing with registered team accounts and editor/viewer permissions
- Job creation, status changes, and reopening
- Continuous on-device iPhone transcription, pause/resume, correction review, and manual entry
- Manual measurement entry, edit/recalculate, delete
- Initial calculations matching the starter project's documented formulas
- CSV export and browser print / Save as PDF
- Basic offline app-shell caching
- Automated tests for calculation and parser modules

## Important scope and validation notes

This is a substantially completed starter application, but it is **not yet production-certified**. The supplied ZIP did not include Greg's two-page source takeoff form, an Excel workbook, builder specifications, or a verified set of expected takeoff examples.

The following rules are implemented because they were explicitly documented in the original starter README:

- Exterior, basement exterior, and party walls: 8 ft = 10/16 sq ft per bay at 16/24 OC; 9 ft = 11/18; 10 ft = 12/20.
- Party-wall totals can be rolled up by height by calling `partyWallTotals`.
- Band joists: sum measurements × 4 × 1.25.
- Attic: sum dimension-pair areas; baffles sum first dimensions; with sprinklers split 30% sprinkler insulation / 70% blown insulation; without sprinklers 100% blown.
- Rectangle dimensions multiply; layered coverage = area × layer count.

Caulk tubes = total exterior wall SF / 50 only. Basement exterior walls, band joists, unfinished areas, garage ceilings, attic, slopes, and party walls do not contribute. Foam units = 25% of caulk tubes. Derived consumables are not additional measured area.

The following are deliberately **not guessed**: material/R-value mapping by framing size, slopes material-row selection, garage/sill/miscellaneous quantity rules, prices, and the exact layout of the final takeoff form.

The parser marks provisional or incomplete results for review. It is not a natural-language understanding system and should not be trusted to accept every dictated phrase without review. In particular, spoken measurement grammar, feet/inches notation, multiple wall groups in one utterance, and builder-specific language need validation with Greg.

The on-device model and microphone audio stay on the iPhone. Confirmed transcript text is sent to the existing Cloudflare API when saved as a measurement, so measurement data entry still requires a network connection. Keep the iOS app in the foreground while dictating; background microphone use is not promised. Browser users can use the Apple keyboard microphone in the existing manual-entry field.

## Requirements

- Node.js 22+
- Cloudflare account
- Cloudflare D1 database
- macOS with Xcode, or an approved cloud macOS build, to compile the iOS app

## iPhone on-device dictation

See [the iOS source readiness audit](IOS_READINESS.md) for verified checks,
source fixes, and the remaining Xcode/device validation requirements.

- The iOS target uses the MIT-licensed open-source [WhisperKit SDK](https://github.com/argmaxinc/argmax-oss-swift), not its paid Pro SDK.
- The selected model is `large-v3-v20240930_626MB` from the public [WhisperKit Core ML model repository](https://huggingface.co/argmaxinc/whisperkit-coreml/tree/main/openai_whisper-large-v3-v20240930_626MB). The first use downloads about 626 MB into the app's Application Support directory; later dictation can run offline. Keep enough additional free space for model loading.
- During first setup, the status reports the SDK's model-download percentage. Loading/compiling the model and loading the tokenizer remain indeterminate stages; this is not a total setup percentage. The model and tokenizer are stored under Application Support, excluded from iCloud backup. A relative model-folder marker is written only after successful loading, so later launches use the saved folder rather than requesting a remote model listing. If those files are missing/corrupted, internet access may be needed again. Saving measurements to shared jobs still requires a network connection.
- WhisperKit's `AudioStreamTranscriber` uses microphone capture, voice activity detection, interim segments, and confirmed segments. The app appends confirmed segment identities only once. Unconfirmed tail text remains reviewable and is not auto-saved.
- Inside a saved job, tap the large Fulcher **LET’S TAKEOFF!** microphone button to prepare the model and start the native recorder. Listening is shown only after a native recording event, with elapsed time and live text. Pause/resume retains the session; **Stop & review** opens an editable transcript. Nothing is added to the job until **Process measurements** is tapped. The recording retains its job, selected section and material, and the original recognized text is retained alongside reviewed measurement data.
- Manual Entry, Saved Jobs, Results and Settings are separate tiles. In a browser, the Record button captures audio and sends it to OpenAI only after Stop; transcription requires internet and a configured Worker secret. The audio is not stored by this application. OpenAI currently lists `gpt-transcribe` at $0.0045 per audio minute, about $16.20/month at two hours each day for 30 days; confirm current provider pricing before regular use. Draft transcripts are kept per job in session storage, and failed saves leave them available for retry. The installed iOS app continues to use WhisperKit locally and does not send microphone audio to OpenAI.
- Speech text is parsed by the existing parser and calculations. Correction phrases are held for Greg to choose “Replace selected entry” or “Add as a new entry”; the prior transcript and correction phrase are retained in the measurement's existing JSON data. The D1 schema and calculation engine are unchanged.
- The open-source SDK does not include the Pro SDK's custom-vocabulary feature. Construction words need real-phone validation; unsupported or ambiguous text must be reviewed rather than guessed.
- The app requires iOS 16 or later. Keep it foregrounded while dictating. Browser users may still use the Apple keyboard microphone in the manual-entry field.
- `com.insulationtakeoff.app` is a provisional bundle identifier. Confirm the final unique identifier before any signing or distribution setup.
- Before a native build, set `VITE_API_BASE_URL` to the verified Cloudflare Worker URL. The native app uses the existing Worker/D1 backend for accounts and saved measurement text; native WhisperKit microphone audio stays on the iPhone. The Worker allows only its own origin and the app's Capacitor origin for credentialed requests. Test login/session behavior on a real iPhone before distributing.

### Build and install from Windows

Web development can continue on Windows or in Replit, but iOS compilation and signing must run on a Mac with **Xcode 26.0+** (required by Capacitor 8). The build host also needs Node.js 22+ and this workspace's pnpm version. Choose a Mac service image that explicitly includes Xcode 26 or later, not just any macOS image. The simplest no-subscription test route is to borrow access to a compatible Mac; a rented Mac is optional and may cost extra.

1. Make the project source available on that Mac (for example, by cloning the repository or copying the workspace), then install the workspace dependencies with `pnpm install --frozen-lockfile`.
2. Deploy the existing Worker source only after explicitly approving deployment. The existing Wrangler config already points to the verified D1 ID; do not create a database or run migrations for this source change. Authenticate Wrangler if needed, then deploy from the repository root:

```bash
pnpm --filter @workspace/insulation exec wrangler login
pnpm --filter @workspace/insulation exec wrangler deploy
```

3. Verify `https://insulation-takeoff.mleo0705.workers.dev/api/health` returns JSON `{"ok":true,"service":"insulation-takeoff"}`. The current live Worker has not passed this check yet.
4. On the Mac, from the repository root, run:

```bash
pnpm --filter @workspace/insulation run mobile:sync:cloudflare
```

This command checks the Worker health response first, then builds the web assets with the verified Worker URL and runs Capacitor sync. It stops before building if the Worker is still returning its current `Hello world` response. It does not deploy or run database migrations.
5. Open `artifacts/insulation/ios/App/App.xcodeproj` in Xcode, select the App target, set the signing team and a unique bundle identifier, connect Greg's iPhone, then choose it as the run destination and click Run.
6. Keep the phone online for its first model download. After the model is cached, test local dictation with cellular and Wi-Fi disabled; reconnect to verify saved measurements sync.

`mobile:sync` only builds web assets and synchronizes the local iOS project; it does not deploy, migrate D1, sign, or publish. The `mobile:sync:cloudflare` helper additionally verifies the API health endpoint and supplies `VITE_API_BASE_URL`. Replit's Linux workspace cannot compile the iOS target. The project currently uses the provisional identifier `com.insulationtakeoff.app`, so confirm it is unique before signing. This direct Xcode development install is the documented test route; TestFlight/App Store distribution is not included.

Codemagic's individual plan currently includes 500 Mac mini M2 build minutes per month, then lists $0.095 per minute. Apple's Developer Program is $99/year and is required for Codemagic's documented device signing and TestFlight workflow. No cloud build, signing, account setup, or paid usage has been started. Approve those costs separately before proceeding.

Do not switch to `small.en` automatically. Benchmark the selected large model on Greg's actual iPhone first; ask before changing models.

## Run locally

```bash
pnpm --filter @workspace/insulation run dev
```

The Vite development server serves the frontend. For full authentication and database API functionality locally, use Wrangler:

```bash
pnpm --filter @workspace/insulation exec wrangler d1 create insulation-takeoff
```

Copy the returned database ID into `wrangler.toml`, then apply the migration:

```bash
pnpm --filter @workspace/insulation exec wrangler d1 migrations apply insulation-takeoff --local
```

Run the Worker and Vite assets together with Wrangler:

```bash
pnpm --filter @workspace/insulation exec wrangler dev
```

For local first-account setup in Replit, add `INSULATION_LOCAL_SETUP_TOKEN` in **Tools > Secrets**. The Replit launcher passes it to the local Worker as `SETUP_TOKEN`; it is not sent to Cloudflare. For a standalone checkout, set a local `SETUP_TOKEN` in `.dev.vars`.

Wrangler secrets are configured in the environment used by `wrangler dev`. If running the browser-only Vite server with `pnpm --filter @workspace/insulation run dev:vite`, the `/api` endpoints will not exist.

## Deploy to Cloudflare

1. Install and authenticate Wrangler:

   ```bash
   pnpm install
   pnpm --filter @workspace/insulation exec wrangler login
   ```

2. Create the D1 database and put the returned database ID in `wrangler.toml`:

   ```bash
   pnpm --filter @workspace/insulation exec wrangler d1 create insulation-takeoff
   ```

3. Apply migrations to the remote database:

   ```bash
   pnpm --filter @workspace/insulation exec wrangler d1 migrations apply insulation-takeoff --remote
   ```

4. If a production secret needs to be added, first get Greg's explicit approval
   for that secret change. Never put secret values in `wrangler.toml`, command
   arguments, source files, GitHub, or chat. To stage browser transcription's
   OpenAI key without sending the new Worker version live, run this from the
   repository root after verifying that the selected Wrangler account contains
   the D1 database whose ID is configured in `wrangler.toml`. Stop if the IDs
   do not match:

   ```bash
   pnpm --filter @workspace/insulation exec wrangler versions secret put OPENAI_API_KEY
   ```

   Wrangler prompts for the value with masked input. Enter the key only at that
   prompt; do not pipe it from `echo` or paste it into the command. This creates
   a Worker version but does not deploy it to traffic. Do not run
   `wrangler versions deploy` or `wrangler deploy` until Greg separately
   approves deployment. The regular `wrangler secret put` command and adding a
   secret through the dashboard deploy immediately, so do not use either for
   this staged change.

   The existing `SETUP_TOKEN` is already configured. If it ever needs to be
   replaced, use the same staged `wrangler versions secret put SETUP_TOKEN`
   workflow, with explicit approval.

5. Build and deploy only after Greg explicitly approves the deployment:

   ```bash
   pnpm --filter @workspace/insulation run cloudflare:build
   pnpm --filter @workspace/insulation exec wrangler deploy
   ```

6. Open the deployed URL. The first visitor who supplies the setup token can create the administrator account. **Do not share the setup token.** After initial setup, the endpoint permanently closes.

7. Sign in as the administrator. Create the second user with an authenticated `POST /api/users` request:

   ```bash
   curl -X POST "https://YOUR-APP.workers.dev/api/users" \
     -H "Content-Type: application/json" \
     -H "Cookie: takeoff_session=YOUR_ADMIN_SESSION_COOKIE" \
     -d '{"email":"greg@example.com","displayName":"Greg","password":"use-a-unique-password-at-least-12-characters"}'
   ```

   The administrator session cookie can be obtained from the browser's developer tools. Do not send it to anyone or paste it into chat. After the team account exists, the job owner can share an individual job from the job screen using the team member email.

## Tests

```bash
pnpm --filter @workspace/insulation run test
PORT=19324 BASE_PATH=/ pnpm --filter @workspace/insulation run build
```

## Security and operations before real job use

- Use unique passwords and keep `SETUP_TOKEN` private.
- Configure account recovery before production use; no password reset flow is included.
- Add rate limiting and security monitoring before exposing the app publicly.
- Configure a custom domain and confirm HTTPS before installing on iPhone.
- Back up D1 regularly.
- Review each parsed measurement and compare the calculations against Greg's approved examples.
- Add a proper PDF template/export after receiving the original takeoff PDF or Excel version.


## Original two-page takeoff form (uploaded reference)

`src/materialCatalog.js` contains the material rows and visible book-price values transcribed from the supplied two-page PDF.

The form's main sections are:
- Blown
- Exterior Walls
- BJ
- Basement Ext. Walls
- Party Walls
- Batt Ceilings (CAFLAT)
- Slopes
- Garage Ceiling (GACA)
- Other

The PDF also has job fields for Date, Lot #, Oracle Order #, Salesman, Subdivision, Customer Name, Street Name, Address, Lock Box?, Special Ceiling?, County, and Phone. Its tabular columns are Area, Material, TRIP, Book Price, Measurements, Total Footage, and Extended Price. Page 2 has a summary for Blown, Batt, Crawl, BSMT, Air Guard, Total, plus Book, Contract, Discount Margin, and PO#.

**Important transcription caveat:** the PDF is a scan. The catalog preserves legible product labels and book prices as read from the image. Ambiguous labels (especially some garage-ceiling product suffixes) should be confirmed against Greg's original paper or spreadsheet before using them for pricing. The `60% / 40% = × .68` note is retained as a form note only; no pricing formula has been inferred from it. Blank or ambiguous book prices are represented as `null`, not guessed.

The catalog is a reference module in this update. It does not yet automatically assign every measurement to a material row or calculate all section-specific quantities; those rules need to be confirmed with Greg's examples and builder specifications before enabling automatic pricing.


## Voice workflow clarification (Greg)

The operator speaks measurements in feet. The operator also chooses the insulation material because it varies by customer. Example workflow:

1. Say a section and optional material, e.g. "exterior basement R-19".
2. Say measurements, e.g. "twenty-four by eight, thirty-two by eight".
3. The parser remembers the current section and R-value for later measurement-only utterances in the same job session.
4. If no material is spoken, it is left blank; the app does not guess a product.

For supported dimension-pair sections, each `length x width` pair is multiplied in square feet and pair areas are added. Example: `24 x 8` + `32 x 8` = 448 sq ft. This is a basic rectangular-area interpretation and must be checked against Greg's actual takeoff conventions. The existing explicit wall bay/spacing/height multiplier remains available when those full wall details are dictated.

Pricing is not part of the calculation workflow. Book prices remain only as reference data from the scanned form; they are not used to calculate quantities or totals.


## Cloudflare GitHub deployment (corrected configuration)

The Worker must receive `/api/*` requests before static-asset fallback. The
`run_worker_first = ["/api/*"]` rule in `wrangler.toml` ensures login, jobs,
and measurements reach `worker/index.js`, while the
remaining paths are served from `dist/`.

### One-time Cloudflare setup

1. This project is already pointed at the existing D1 database named `insulation-takeoff`. Do not create a second database or replace its ID.
2. The existing Worker already has the `DB` D1 binding and `SETUP_TOKEN` secret. Do not paste secrets into GitHub or commit them to this repository.
3. In the Worker settings, keep the `workers.dev` subdomain enabled.
4. Set `OPENAI_API_KEY` as a Worker secret to enable browser transcription by
   following the staged-secret procedure above. Do not add it through the
   dashboard because that deploys immediately. Set it separately in local
   Replit Secrets for preview; do not commit it. The iOS build uses WhisperKit
   locally and does not need this secret.
5. This voice change does not alter D1 schema. The existing migration ledger was verified and `0002_login_rate_limits.sql` was already applied after approval. Do not recreate the database or rerun migrations.

Do not change production secrets, run any remote migration, or deploy until
Greg approves that specific action.

### GitHub-connected Cloudflare build settings

Use the repository root as the project root:
- Build command: `pnpm --filter @workspace/insulation run cloudflare:build`
- Deploy command: `pnpm --filter @workspace/insulation exec wrangler deploy`
- Root directory: `/`

The `wrangler` package is included as a development dependency. The database ID is already filled in. Cloudflare should build from the repository root with the commands above.

After deployment, visit the `workers.dev` URL. The first account setup requires
the `SETUP_TOKEN`; create the administrator account, then create Greg's member
account from the authenticated admin API. Do not send either password or token
in chat. Keep the setup token private.

### Important

This is not production-ready until the verified Worker target and native API
origin are configured, login/job/voice flows are tested on the iPhone, and the
signed iOS app is installed. `SETUP_TOKEN` is needed for initial account setup
and `OPENAI_API_KEY` is needed only for browser transcription. The app does not include password reset
or automated account recovery. Keep a secure backup of the database.


## Fixes in this maintenance update

- API fetch options now preserve both JSON content-type and caller-supplied headers.
- First-admin setup uses one conditional D1 insert instead of a separate count-then-create sequence.
- Failed login attempts are counted in D1 and throttled by hashed IP and email keys. Migration `0002_login_rate_limits.sql` was already applied to the verified D1 target after approval.
- Mutating API requests reject a mismatched browser `Origin` header when one is supplied.
- The browser Record button now uploads completed audio to OpenAI for transcription through the authenticated Worker; the native WhisperKit path remains on-device.
- Band-joist parsing no longer removes legitimate measurement values merely because they match the selected R-value.

### Deploying this update safely

1. Keep your existing D1 database ID and secrets.
2. Back up D1 before applying schema changes.
3. No migration is needed for the on-device voice change; the D1 schema is unchanged.
4. Deploy the Worker and frontend only after the user explicitly approves: `pnpm --filter @workspace/insulation run deploy`.
5. After approval and an iOS build, verify `/api/health`, login, job listing, creating/editing measurements, logout, and on-device dictation.

The login throttle uses a shared D1 table, so limits apply across Worker instances. It is a basic application-level control, not a replacement for Cloudflare WAF/rate-limiting rules. Configure edge rate limiting for public production traffic as well.
