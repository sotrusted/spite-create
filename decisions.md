# Decisions

Product and design decisions, newest first. One line of context each so we
remember why, not just what.

## 2026-09-22 - Masthead baseline by arithmetic, quotes stop shrinking

- **A randomized masthead CAN hold one baseline.** First attempt froze the
  font size, which was giving up. The real fix is arithmetic: position each
  title at `baseline - (ascent + inkDrop) x fontSize`, with ascent taken from
  each shipped TTF's hhea table (plus lineGap - only Times has any) and
  inkDrop measured by rendering the title and comparing its ink bottom to the
  metric baseline (Caveat hangs 0.061em below it, Times sits 0.027em above).
  Size randomization is back; the size is chosen as the largest that fits the
  slot so autoshrink never fires and invalidates the maths. Measured spread
  across launches: 21px -> ~3px typical. Table in constants/fontMetrics.ts.
- **Quotes are never auto-shrunk.** Three rounds of raising a height cap
  (62%, then 85%) were treating a symptom; the cap itself was wrong. Default
  is 90% of canvas width at any depth, and the canvas now lets a quote be
  pinched past the canvas edges (3x max, 40pt always kept grabbable) - both
  composer and backend clamps had to be relaxed together or WYSIWYG breaks.
- Crop guides hide while quoting: including the strip in the crop bounds
  (needed so the optimistic preview keeps the OP) had them drawing white
  hairlines around the quote.

## 2026-09-21 - Two production bugs, eager posting, blend modes reverted

- **Reposts lost their parent strip in production.** `_composite_original`
  read the quoted parent via `.path`, which S3 storage does not implement;
  the exception hit a blanket `except` and every repost rendered reply-only.
  Now read through the storage API. Regression test emulates S3 faithfully
  (no .path, but streamable) and was confirmed to FAIL without the fix.
  Both render swallow-points now log loudly and report to Sentry.
- **Every new user hit "that handle is taken".** App launch fires profile +
  feed + notifications concurrently; each raced to mint a device uuid, so
  the losers became orphan accounts and the winner's handle PATCH collided
  with its own shadow. ensureDeviceId now shares one in-flight promise.
- **Eager posting.** The composer closes immediately and the request
  finishes in the background (a round trip is ~1s on a phone, and ~0.2s of
  that is the server). Failure raises a Retry alert holding the payload, so
  no composer state is needed. Removed an artificial 300ms delay and the
  post spinner. Found while doing it: the composer is a navigation screen,
  so its onPost prop was never passed and had always been undefined - posts
  only appeared because closing the composer remounted the feed. Replaced
  with a small buffered event bus (utils/postEvents).
- **Masthead** keeps random post-inheritance on load, but tapping it now
  re-rolls from the FULL composer option space (every font, colour,
  formatting toggle, size clamped 20-30pt) with a guaranteed font change and
  a 4.5:1 ink guard. Title is "Creative Mind's Ideas Magazine" again, on the
  loading screen too (size floor raised to 18).
- **Blend modes removed** (one day old); opacity and gradients stay.
  Tap-to-collapse parked behind FEATURES.collapsePosts - the recursive
  renderer stays in PostCard. Composer lost the Text button, gained a
  checkmark that commits an edit. Palette orange is now #FF9500.
- Element-position NaN guard: a touch without location coords used to shunt
  a text element to the top-left corner.

## 2026-09-20 - Blend modes, gradients, glyph armor, masthead roulette

- **Blend modes** (multiply / screen / overlay / difference) per text
  element - composer previews via new-arch mixBlendMode, server composites
  the whole element layer through ImageChops; goldens assert the exact
  blended color after a silent-NameError incident proved weak tests bless
  broken renders. Blanket exception swallowing in generate_image remains a
  known trap.
- **Gradient backgrounds**: the legacy background_gradient render path is
  live again - long-press the bg swatch cycles six two-stop presets, tap
  returns to solids. Everything (guards, reposts, theming) keys off the
  top stop. Blends over gradients = text that shifts color as it falls.
- **Glyph-bomb protection**: zalgo capped at 2 combining marks per base,
  control/zero-width/directional-override chars stripped at the render
  choke point; ornamental glyphs untouched.
- **Masthead**: inherits a RANDOM first-page post's full costume (font,
  color, bold/italic/underline/kerning/glow) on load; tapping the header
  negative space re-rolls, guaranteed visibly different. The + button
  freezes the launch theme. Composer got opacity (with golden), bigger
  controls, no caps button; spawn-time contrast guard kills red-on-red
  defaults; rails swapped (moderation left, Open+Quote right, single-open,
  close-on-drag-start).

## 2026-09-16 - Final name: Typing Magazine (masthead: "Typing")

- Masthead is just **Typing** (adaptive font/color kept - the wordmark
  shape-shifts with the feed). Composer placeholder: "Typing...". Store
  name "Typing Magazine", subtitle "Creative Mind's Ideas" - the old name
  survives as the deck line. Rhymes with Spite Magazine (house lineage);
  the gerund = the magazine is being written right now.
- Swept: Apple app record (via ASC API), app.json (icon label "Typing"),
  legal copy, WS greeting, digest subject [Typing], website masthead.
  Domain creativemindsideasmagazine.com stays (API + email live there);
  typingmagazine.com available, purchase pending approval.
- Empty feed now bounces (alwaysBounceVertical) so pull-to-refresh works
  on a fresh install; onboarding modal lost its subtitle and gained
  tap-away keyboard dismiss.

## 2026-09-11 - Production live + identity bug fixed + TestFlight staging

- **Production API**: https://api.creativemindsideasmagazine.com (spite-prod
  box, Daphne behind nginx + certbot TLS, S3 media, user-systemd, redis db 3).
  Domain registered on Route 53; AWS budgets + anomaly alerts set.
- **CRITICAL FIX: device identity was brand_yearClass_model - every phone of
  the same model was the SAME USER.** Now a per-install UUID persisted to
  disk; API interceptor awaits it, WS passes it at connect.
- Standalone builds (no dev-server hostUri) now fall back to the production
  API URL; Expo Go dev keeps LAN autodetection.
- TestFlight staging: eas.json, bundle id com.cmim.magazine, icon shows
  "CMIM" (full name truncates under icons), 4 icon candidates + splash in
  frontend/assets/brand/ (Pillow, house fonts).

## 2026-08-31 - New-posts banner + repost notifications

- **WS posts no longer beam straight into the feed.** They buffer behind a
  tappable [N NEW POSTS] pill (Twitter-style) so the collage never shifts
  under the reader. Tap releases + scrolls to top; pull-to-refresh clears
  the buffer. (Found while building: live insert had NEVER worked - the
  consumer sends 'post', the client read 'post_data'.)
- **Repost notifications (MVP, in-app)**: Notification model; created when
  someone reposts you; delivered live over a per-user WS group (client
  identifies via ?device= on the socket) as a toast, or fetched unread on
  next open ("N reposts while you were away"). APNs push comes with the
  EAS build.

## 2026-08-31 - Loading screen + App Store UGC gate + zero tsc errors

- **Loading screen is a composer demo reel**: the magazine name in a chip,
  cycling fonts/colors/chip colors/formattings on precomputed frames
  (coprime strides so every tick changes every dimension). It is the
  generic loading state: Feed initial load, Profile, PostDetail.
- **First-launch terms gate** on the handle modal (guideline 1.2): checkbox
  with tappable terms/guidelines, Continue disabled until agreed. Legal
  copy centralized in constants/legal.ts, shared with Settings.
- tsc clean (was 4 baseline errors): nav theme fonts, dropped the invalid
  composer presentation value (runtime ignored it - behavior unchanged),
  and background pinch/pan simultaneousHandlers now use real refs (string
  ids were silently no-ops).

## 2026-08-30 - The app is named Creative Mind's Ideas Magazine (singular possessive)

- Earnest-institutional deadpan (in the "amazing house magazine" family).
  Swept through masthead (autoshrinks to one line), app.json name/slug,
  profile subtitle ("Contributor, ..."), settings legal copy, WS greeting.
  Support email domain still says subscript-app.com - needs a real domain.

## 2026-08-31 - Adaptive masthead

- **The header is part of the collage**: it takes the topmost visible post's
  background color and title font (auto-contrast text, profile icon follows).
  Latches ONCE per launch from the first visible post - it does not re-theme
  on scroll. Driven by FlatList viewability (20 percent threshold);
  font_choice added to the feed payload.

## 2026-08-31 - Geometry-honoring collapse (general solution)

- **Collapse rendering is now fully recursive AND position-preserving.**
  Each level splits its canvas around its child's rect: content above stays
  above, content below stays below, the removed region squeezes to the chip
  (conservative margins). Nesting is structural - [p1 [p2 [p3 +]]] at any
  depth, chip always inside its quoter's canvas.
- **Side-by-side layouts detected** (reply content overlapping the strip's
  vertical range): no squeeze there - the band stays and the collapsed chain
  overlays at the strip's true position. Approximate by design.
- Whole-card collapsed chips: the full row is the tap target, slightly
  larger type, breathing room below the header.
- Composer: last background color persists like the font; repost caption +
  strip ensemble defaults to center-ish; the size slider is fixed-position
  (keyboard resize made it jump on open).

## 2026-08-30 - Deep collapse, strip gestures, list markers, font memory

- **Collapse works at every chain level**: the feed serializer emits
  quote_chain - each quoted ancestor's strip rect mapped into the root
  post's canvas coords plus its reply-only strip source. Tapping any level's
  region collapses that level and deeper; the collapsed view is a SQUEEZED
  STACK (reply crop, each visible ancestor's smushed strip, chip band in the
  post's own color) - dead space between levels is dropped, margins kept.
  Blocked ancestors lock the deepest allowed expansion. Renders are
  prefetched on mount so toggling is instant.
- **The OP strip in the composer pinches (center-anchored zoom) as well as
  drags**; the WYSIWYG rect carries scale to the bake automatically.
- **List markers**: bullet (the default, a real bullet character), dash,
  star, numbered - one button cycles all. Prefixes now show in the editing
  mirror too (WYSIWYG won over caret purity).
- **Bold/italic buttons are hidden (not grayed) for families without faces.**
- **Font memory**: the last chosen font persists across composer sessions;
  new elements and the placeholder start in it.
- Incident note: brew install cloudflared removed fribidi, silently killing
  Raqm kerning - the golden suite caught the 2px drift immediately.

## 2026-08-30 - Polish: per-line chips, chip render fix, crop dimming

- **Text chips are per-line** (staircase): each line gets its own rectangle
  hugging that line, both sides - server draws per-line rects in the layout
  path (kept out of the glow blur), preview uses a nested text span whose
  background highlights each rendered line natively.
- **Fixed: chips never rendered server-side.** The composer cycled
  backgroundMode but the payload never derived hasBackground/colors from it.
  Mapping now lives in buildPostPayload: 'white' = white chip + kept text
  color; 'inverted' = colored chip + white text.
- **Composer dims everything beyond the projected crop bounds** (12 percent
  black) in addition to the hairline guides.

## 2026-08-30 - Text formatting: bold, italic, underline, lists

- **Real faces only, no synthetic styling**: bold/italic toggles appear only
  for families with an actual font file (Courier Prime: full set; Times: full
  set from macOS; Caveat: bold instanced from the variable font via
  fontTools). Arial Black, Impact, Papyrus have no variants - their toggles
  render disabled. Same files loaded by the app and the Pillow renderer.
- **Underline** renders everywhere (RN textDecorationLine; server draws the
  rule per line via the per-line layout path, so it survives glow/wrap).
- **Lists**: bullet ("- ") and numbered prefixes applied per typed line,
  forced left-align, identical transform on both sides. Raw text is stored;
  prefixes are display/render-time. While editing you see raw text;
  prefixes appear on commit.
- The config row scrolls horizontally (11 controls now).

## 2026-08-30 - Recursive collapse + draggable OP

- **Collapse is recursive**: tapping the REPLY region of a post collapses the
  whole card into its chip; tapping the QUOTED STRIP region collapses just
  the parent chain into an inline chip floating in the strip's slot (card
  height unchanged - the reply's background shows through). Tap chips to
  expand back. Hit-testing uses the strip's canvas-space geometry from the
  feed payload (quote.geometry). Blocked quotes are locked parent-collapsed.
- **The OP strip is draggable in the composer** like a text element; its
  rect is WYSIWYG all the way (preview = payload = bake).

## 2026-08-30 - Feed compression + house fonts

- **Any post collapses into its chip on tap** (the exact converged chip:
  post's background color, ~24-char snippet, auto-contrast text, plus sign,
  hairline, centered). Tapping the chip expands it back. Reposts still show
  the full smushed composite when expanded - the chip is now a feed
  compression gesture, not repost chrome. State is session-local.
- **Post detail moved to swipe-right rail** ("Open"); swipe-left keeps
  Report / Mute / Block; long-press keeps repost.
- **UI chrome uses house fonts**: Courier Prime for all interface text,
  Arial Black for headings - no more system font (the React-default look).

## 2026-08-30 - Repost layout v4: no chip, OP always visible and smushed

- **The expand/collapse chip is dead.** Quoted OPs simply render smaller:
  inset 8 percent per side ("smushed horizontally with a margin"), baked into
  the composite exactly where the composer showed them (WYSIWYG geometry).
  The feed shows the composite directly - zero interaction, zero chrome,
  fully continuous canvas. Reply above, smushed OP below by default.
- **The response-only render survives as the blocked-viewer fallback**: when
  the quoted author is blocked, the feed swaps to the response render - OP
  gone, reply intact - which is how the block policy works without a chip.
- **Brutalist sweep**: all 33 border radii removed app-wide (buttons, modals,
  swatches, avatar, slider handle); server-rendered text chips are square
  rectangles too. No pills, no circles, no rounded anything.

## 2026-08-30 - Repost layout v3: WYSIWYG strip + in-canvas chip

- **The quoted strip bakes exactly where the composer showed it** - true
  WYSIWYG. getRepostStripRect (frontend) is the single source: the preview
  layer renders it, the payload sends it as repost_geometry {x, y, width} in
  canvas px, the server pastes it verbatim. Default placement is below the
  caption slot; no geometry sent falls back to that stacking server-side.
- **The quote chip floats INSIDE the reply's canvas** (bottom-left, 10pt
  margin, rounded, hairline) instead of its own row - chrome rows in negative
  space would break the continuous-canvas effect. Chip below the reply.
- v2's forced above/below stacking of the bake is superseded by WYSIWYG.

## 2026-08-30 - Repost layout v2 (post-grill feedback)

- **Quoted strips stack directly above the response content** (quote-then-
  reply order) instead of centering on the canvas - centering let captions
  overlap the quote. The quote chip occupies the same slot in the collapsed
  view (above the response), so expanding literally fills the chip's position
  with the strip: "what would have been shown."
- **In-image text selection**: the detail view overlays invisible selectable
  Text at each element's exact rendered position - native word-by-word
  selection on what looks like the image. (True Live Text OCR would need a
  native module and leaving Expo Go; unnecessary since we know the text and
  geometry.) The separate alt-text block was removed.
- **Handles are editable**: on the Profile screen (tap to edit) and in a
  first-open modal that offers the generated handle for customization.
  Server validates: 3-30 chars, lowercase/digits/hyphens, unique.

## 2026-08-30 - Grill session: reposts, blocks, gestures, signatures

- **Reposts collapse by default.** Feed shows the response-only render plus a
  QUOTE CHIP below it: a small box in the quoted post's background color,
  containing the first ~24 chars of the parent's text and a (+). Tapping the
  chip swaps in the full composite - which contains the entire chain
  recursively, so one tap expands everything (deep chains: post detail view).
  Tap again collapses; state resets on feed refresh.
- **Composite bakes quotation visually**: the quoted strip is inset ~4% with
  a hairline border, drawn by the compositor, so nesting reads as depth and
  the recompression chain keeps its texture.
- **Reposts cannot use their parent's background color** (the chip inherits
  the parent color - the repost must differ so the chip reads).
- **Chain chips preview the direct parent**, not the root.
- **Block ships v1; moderation is v2** (but the quoted-hiding architecture is
  built generically now). Block = (i) their posts hidden from you, (ii) your
  posts hidden from them, (iv) quoted strips hidden bidirectionally (chip
  becomes a gray "hidden" chip, no expand). No (iii): (ii) already prevents
  future reposts in practice. Rationale for skipping moderation now: text-only
  posts remove the existential risk; report/shadowban + Block suffice at
  friends scale.
- **Feed gestures**: long-press on a post = straight into the repost composer
  (old action sheet deleted). Swipe left = rail with Mute / Block / Report.
  Copy Text is cut; instead, TAP on a post body opens a minimal DETAIL VIEW
  (image + selectable text + repost + report, no author handle - unsigned
  stays anonymous everywhere). "Repost without caption" parked as an idea.
- **Signatures reborn as rendered usernames**: no band or overlay - signing
  renders the @handle as a small line under the content, baked into the PNG,
  in the user's chosen font + color (customizable on Profile; auto-contrast
  overrides unreadable choices). Extends the crop by one line.
- **Aspect cap stays 5:4**; out-of-cap content silently crops with guides
  (plus dimming beyond the projected bounds, later).
- **Per-line chips confirmed wanted**, scheduled after the repost work.
- **Milestone: the repost mechanic IS the product** - build it before
  TestFlight.

## 2026-08-30 - Signatures parked

- **Signatures are gated off** (FEATURES.signatures = false): no sign toggle,
  no canvas band preview, and the feed renders previously-signed posts
  bandless. Backend fields and API stay intact. Reason: the band's design and
  placement (top vs bottom) are unresolved - park it rather than ship it ugly.
  Revisit in the grill session.

## 2026-08-30 - Feed shape and editing truth (round 2)

- **Posts are capped at 5:4 portrait** (height <= 1.25 x width), cropped
  centered on content. Rationale: feed scannability - no post owns the whole
  screen. GRILL: 1:1 vs 5:4, and whether the composer should hard-stop
  content placement outside the cap instead of silently cropping.
- **Editing shows a live styled mirror** (chip wrapping the text block,
  rainbow, glow all visible while typing) with an invisible-text input on top
  for the caret. Staged content is centered in the negative space above the
  config row, not hugging it.
- **Signature band preview sits at the projected crop top** - where the feed
  actually draws it - and is hidden while the parity ghost is up (the band is
  a feed overlay, not part of the PNG). GRILL: band at top vs bottom of the
  post, and its visual design.
- **Letter spacing presets widened to 0/3/8/15** (three subtle steps did not
  read as a feature).
- **Papyrus stays**, extracted from the macOS .ttc (face 1, regular) into a
  bundled TTF used by both sides. Side fix: the server previously loaded
  face 0 (Papyrus Condensed) by accident.

## 2026-08-30 - Composer editing UX overhaul

- **Editing is staged, not in place.** While editing, the text input is
  centered horizontally and anchored above the config row, growing upward as
  it wraps. The element's canvas (x, y) never changes during editing; display
  text returns there on commit. Replaces the old behavior where the input sat
  at the element position and got covered by controls.
- **One config row, buttons change values in place.** Font, color, alignment,
  caps, chip background, glow, and letter spacing all cycle or toggle on tap.
  No selector rows. Rainbow lives at the end of the color cycle.
- **Signing is a visible toggle.** Topbar pencil button toggles the signature;
  a preview band with the user's handle appears on the canvas. The hold-to-sign
  long-press and its hint text are gone (undiscoverable, and the hint chip was
  bottom-edge clutter).
- **Caps default OFF.** Text posts what you type; caps is one tap away.
- **Justification added** (left/center/right), rendered identically server-side
  (block stays centered on the element anchor; lines justify within the block).
- **Text chip (background) does not fill the editing input width.** In display
  and server render, the chip wraps the text block. Open question for grill
  session: per-line chips (Instagram-style) vs block chips.
- **Font size slider: wide-at-top smooth wedge, no notches**, drag is relative
  to the size at grab (fixes jump-to-max and stuck-at-max).
- **Trash can appears only after ~12pt of actual drag movement.**
- **font_size validation is 8-1000 canvas px** (old 12-150 limit was from the
  screen-points era and rejected legitimately scaled text).

## 2026-08-30 - Simulator feedback loop

- Design iteration uses the iOS simulator: Claude taps (idb) and screenshots
  (simctl) its own changes before claiming them done. `./tap.sh x y`,
  `./shot.sh name`. Metro must run with a real TTY (screen session) or under
  the user's dev.sh - never with CI=1 (kills the file watcher).

## 2026-08-29 - Fonts and text aesthetics

- Six font registers: Arial Black (shout), Impact (meme), Times New Roman
  (literary), Papyrus (unhinged), Courier Prime (typewriter), Caveat
  (handwritten). New fonts must be OFL/free-licensed and bundled in
  frontend/assets/fonts, loaded by both the app and the Pillow renderer from
  the same files. Arial Black/Impact must be swapped for free lookalikes
  before App Store release.
- Rainbow text, glow, and letter spacing are per-element styles rendered
  identically on both sides. Rainbow palette lives in colors.ts and models.py
  and must match.
- Background color cycling auto-bumps clashing text colors to a readable
  palette color (contrast >= 4.5 target). Rainbow text is exempt.

## 2026-08-28 - Images gated for launch

- Image backgrounds and stickers are fully built (incl. crop bars) but gated
  off: FEATURES.imageUploads (frontend) and ALLOW_IMAGE_POSTS (backend).
  Launch is pure text create-mode; images return as a post-launch update,
  likely signed-posts-first, with AI moderation wired into the upload
  endpoints. Rationale: launch-feed coherence, ops simplicity, and lifting a
  constraint later beats adding one.
- Crop bars (when images are on): the band between two draggable bars is what
  the feed shows; content outside the band still extends the crop rather than
  being cut.

## 2026-08-27 and earlier - Rendering architecture

- Fixed logical canvas: CANVAS_WIDTH = 1080, height follows device aspect.
  All geometry maps screen points -> canvas px at submit (buildPostPayload).
  Every device sees identical posts; goldens are device-independent.
- WYSIWYG parity is enforced by tests: golden images (backend), payload
  contract fixtures (shared/fixtures, tested from both sides), and the
  dev-only parity ghost overlay after posting.
- Reposts embed the original's cropped strip centered on the reposter's new
  background. repost_geometry (x/y/scale) is sent but unused - wire it up if
  draggable repost strips are wanted.
- The feed is a zero-gap collage of variable-height strips cropped to content
  bounds (top_y/bottom_y) - this is the app's signature look.
- No emojis anywhere in code, logs, or UI chrome (existing house rule).
