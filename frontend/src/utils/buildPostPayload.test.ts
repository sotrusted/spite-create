// Payload contract tests. The blessed fixture (shared/fixtures/post-payload.json)
// is also consumed by the backend test suite, which POSTs it to the API and
// golden-tests the render - together they pin the whole state -> pixels path.
// Bless intentional changes with: npm run bless:fixtures
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildPostPayload, getRepostStripRect, CANVAS_WIDTH, ComposerSnapshot } from './buildPostPayload';

const fixturesDir = path.join(__dirname, '..', '..', '..', 'shared', 'fixtures');

const loadFixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));

const baseSnapshot: ComposerSnapshot = {
  screenWidth: 393,
  screenHeight: 852,
  textElements: [],
  stickerElements: [],
  backgroundColor: '#F8F8FF',
  backgroundGradient: [],
  backgroundImage: null,
  imageBackgroundScale: 1,
  imageBackgroundPosition: { x: 0, y: 0 },
  imageCoverScale: 1,
  cropTop: 0,
  cropBottom: 852,
  isSigned: false,
};

test('payload matches the blessed shared fixture', () => {
  const snapshot = loadFixture('composer-snapshot.json');
  const expected = loadFixture('post-payload.json');
  // JSON round-trip drops undefined keys - matching what axios actually
  // sends over the wire, which is the contract the backend consumes
  const actual = JSON.parse(JSON.stringify(buildPostPayload(snapshot)));
  assert.deepEqual(actual, expected);
});

test('geometry maps screen points onto the fixed canvas', () => {
  const payload = buildPostPayload({
    ...baseSnapshot,
    textElements: [{
      content: 'x', x: 100, y: 200, fontSize: 30, scale: 2,
      color: '#000000', fontFamily: 'arial-black',
      hasBackground: false, backgroundColor: '#FFFFFF', capsLock: false,
    }],
  });
  const k = CANVAS_WIDTH / 393;
  assert.equal(payload.canvas_width, CANVAS_WIDTH);
  assert.equal(payload.canvas_height, Math.round(852 * k));
  assert.equal(payload.text_elements![0].x, Math.round(100 * k));
  assert.equal(payload.text_elements![0].fontSize, Math.round(30 * 2 * k));
});

test('capsLock is baked into the rendered content', () => {
  const payload = buildPostPayload({
    ...baseSnapshot,
    textElements: [{
      content: 'shout this', x: 0, y: 0, fontSize: 24, scale: 1,
      color: '#000000', fontFamily: 'arial-black',
      hasBackground: false, backgroundColor: '#FFFFFF', capsLock: true,
    }],
  });
  assert.equal(payload.text_elements![0].content, 'SHOUT THIS');
  // text_content keeps the raw text for copy/search/alt purposes
  assert.equal(payload.text_content, 'shout this');
});

test('background image scale converts cover-relative to raw pixels', () => {
  const payload = buildPostPayload({
    ...baseSnapshot,
    backgroundImage: 'http://example.test/bg.png',
    imageBackgroundScale: 1.5, // user pinched 1.5x beyond cover
    imageCoverScale: 0.25,     // cover factor for a large photo
    imageBackgroundPosition: { x: 10, y: -20 },
  });
  const k = CANVAS_WIDTH / 393;
  assert.equal(payload.background_image_scale, 1.5 * 0.25 * k);
  assert.deepEqual(payload.background_image_position, {
    x: Math.round(10 * k),
    y: Math.round(-20 * k),
  });
});

test('style fields pass through with letterSpacing scaled to canvas px', () => {
  const payload = buildPostPayload({
    ...baseSnapshot,
    textElements: [{
      content: 'styled', x: 0, y: 0, fontSize: 24, scale: 1,
      color: '#000000', fontFamily: 'arial-black',
      hasBackground: false, backgroundColor: '#FFFFFF', capsLock: false,
      letterSpacing: 5, glow: true, rainbow: true,
    }],
  });
  const k = CANVAS_WIDTH / 393;
  const el = payload.text_elements![0];
  assert.equal(el.letterSpacing, Math.round(5 * k));
  assert.equal(el.glow, true);
  assert.equal(el.rainbow, true);
});

test('crop band is sent in canvas px only when bars moved off full bleed', () => {
  const withImage = {
    ...baseSnapshot,
    backgroundImage: 'http://example.test/bg.png',
    imageCoverScale: 0.5,
  };
  const k = CANVAS_WIDTH / 393;

  // Full bleed: no crop fields
  const fullBleed = buildPostPayload(withImage);
  assert.equal(fullBleed.crop_top, undefined);
  assert.equal(fullBleed.crop_bottom, undefined);

  // Bars moved: band mapped to canvas px
  const cropped = buildPostPayload({ ...withImage, cropTop: 200, cropBottom: 600 });
  assert.equal(cropped.crop_top, Math.round(200 * k));
  assert.equal(cropped.crop_bottom, Math.round(600 * k));

  // No background image: bars are meaningless, never sent
  const noImage = buildPostPayload({ ...baseSnapshot, cropTop: 200, cropBottom: 600 });
  assert.equal(noImage.crop_top, undefined);
});

test('repost geometry mirrors the preview rect in canvas px', () => {
  const original: any = {
    id: 'op-1', image_width: 1080, image_height: 2341,
    top_y: 1000, bottom_y: 1200,
  };
  const rect = getRepostStripRect(original, 393, 852)!;
  const payload = buildPostPayload({
    ...baseSnapshot,
    textElements: [{
      content: 'reply', x: 196, y: 426, fontSize: 24, scale: 1,
      color: '#000000', fontFamily: 'arial-black',
      hasBackground: false, backgroundColor: '#FFFFFF', capsLock: false,
    }],
    repostData: { originalPost: original, screenshotUri: 'x' },
  });
  const k = CANVAS_WIDTH / 393;
  const geometry = payload.repost_data!.repost_geometry!;
  assert.equal(geometry.x, Math.round(rect.left * k));
  assert.equal(geometry.y, Math.round(rect.top * k));
  assert.equal(geometry.width, Math.round(rect.width * k));
});

test('sticker geometry scales uniformly, gesture scale untouched', () => {
  const payload = buildPostPayload({
    ...baseSnapshot,
    stickerElements: [{
      id: 's1', uri: 'http://example.test/s.png',
      x: 50, y: 60, width: 80, height: 90,
      scale: 1.25, rotation: 15, shape: 'full',
    }],
  });
  const k = CANVAS_WIDTH / 393;
  const sticker = payload.sticker_elements![0];
  assert.equal(sticker.x, Math.round(50 * k));
  assert.equal(sticker.width, Math.round(80 * k));
  assert.equal(sticker.scale, 1.25);
  assert.equal(sticker.rotation, 15);
});
