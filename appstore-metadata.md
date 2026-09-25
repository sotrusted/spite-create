# App Store metadata (draft — paste into App Store Connect)

## Name (30 chars max)
Type Magazine

## Subtitle (30 chars max)
Creative Mind's Ideas

## Description
A magazine of creative minds' ideas.

You write text. It gets typeset. It joins the collage. That is the whole
thing.

There are no likes. There are no followers. There is no algorithm. The
newest page is on top.

- Six fonts, chosen carefully. Some of them are even good.
- Colors from the old internet.
- Rainbow text, glow, chips, kerning — the aesthetics of text.
- Hold down on any post to quote it in your own. Quoted posts appear
  smushed, which is a technical term.
- Tap a quote to fold it into a little chip. Tap the chip to unfold it.
- Posting is semi-anonymous. You get a handle. It is not your name,
  unless you insist.
- Sign your posts, or don't.

The magazine is public, the pages are strangers', and the print run is
infinite.

"Amazing." — The Publisher

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
- **Diagnostics → Crash Data** and **Performance Data**: server-side error
  reports and 10% request traces (Sentry). No device id, no local variables,
  no IP (send_default_pii off).

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
Reports: swipe left on any post. Blocking: swipe left → Block. Content is
text-only in this release (image uploads are disabled server-side).

## Reminders before submitting
- Remove the DEV section from Settings (Preview Loading Screen row) —
  fine for TestFlight, remove for App Store.
- Screenshots: need 6.7" (1290×2796) set minimum; take from seeded feed.
- SMTP creds on the VM so support/report digests actually email.
