# App Store metadata (draft — paste into App Store Connect)

## Name (30 chars max)
Type Magazine

## Subtitle (30 chars max)
Creative Mind's Ideas

## Description
(plain text: the App Store does not render markdown)

Type Magazine is an app for the creative mind's ideas. Experience the power of text to awe and inspire when expressed in an image!

Express yourself! The iPhone is a visual device, but thoughts require language. Select from your favorite fabulous fonts and trendy colors to express an original thought, or reproduce your favorite trend!

Better than Create Mode! We're always hitting the volume button and the sleep button to screenshot someone's post, but what do you say we turn down the volume on that and put that whole notion to sleep? This is Type -- let's just hold down on the post or we can double tap to instantly quote! Sleep on it, this the kind of app that will hold you down. ;)

Express your personality! Use Type Magazine to express your deepest secrets or quirkiest anecdotes instantly. Identities coming soon!

Creative mind's ideas. Be creative. Your ideas count! 12345678910

## Keywords (100 chars max)
text,typography,anonymous,magazine,zine,brutalist,fonts,posting,collage,writing,board,creative

## URLs
- Marketing: https://creativemindsideasmagazine.com
- Support: https://creativemindsideasmagazine.com/support.html
- Privacy Policy: https://creativemindsideasmagazine.com/privacy.html

## App Privacy questionnaire (Apple's data collection form)
Checked against the code 2026-09-25. No analytics, ads or crash SDKs in the
app; the only third party is Sentry, server-side, scrubbed of device ids.

Collected, **linked to the user**, not used for tracking, purpose App Functionality:
- **Identifiers → User ID**: the handle and the random per-install id the
  app generates (sent as X-Device-Id). Not "Device ID": that category means
  device-level ids like IDFA/IDFV, which the app never reads.
- **User Content → Other User Content**: posts (text and styling), reports
  users file (reason + optional note), and mutes/blocks. Stored against the
  account, hence linked even though handles are pseudonymous.

Collected, **not linked**, not used for tracking, purpose App Functionality:
- **Diagnostics → Other Diagnostic Data** (server-side error reports) and
  **Performance Data** (10% of requests traced), via Sentry. Not "Crash
  Data": the app itself sends no crash logs. No device id, no local
  variables, no IP (send_default_pii off).

Not collected: contact info, health, financial, location, sensitive info,
contacts, photos/videos (image posts are off; saving to Photos is local),
audio, browsing/search history, purchases, usage data (view counts are
anonymous totals), other data.

Tracking: **No** ("Data Used to Track You": none).

## Age rating questionnaire
- User-generated content: YES → requires the standard UGC answers:
  moderation (report + block + review: yes), filter objectionable
  content (report-driven review), contact info (support email).
- Expect 17+ or 12+ depending on answers about infrequent mature themes;
  UGC apps commonly land 17+. Accept what the questionnaire computes.

## Review notes (for the App Review team)
The app requires no account. On first launch it shows a terms agreement
and handle picker — tap the checkbox and Continue. Post via the + button.
Reports: swipe left on any post. Blocking: swipe left → Block.
Account deletion: Profile → Settings → Account → Delete Account (removes the
account, all its posts and images; quotes of it in other people's posts
are replaced with a "post removed" placeholder). Content is
text-only in this release (image uploads are disabled server-side).

## Reminders before submitting
- Remove the DEV section from Settings (Preview Loading Screen row) —
  fine for TestFlight, remove for App Store.
- Screenshots: need 6.7" (1290×2796) set minimum; take from seeded feed.
- SMTP creds on the VM so support/report digests actually email.
