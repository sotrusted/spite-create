// Seeds a LOCAL backend with a small, curated magazine for App Store
// screenshots. Every post goes through buildPostPayload and toCanvasState -
// the composer's own code path - so renders are exactly what the app makes.
//
//   npm run seed:store                      # http://localhost:8001, 440x956 (6.9")
//   API=http://host:8001 npm run seed:store
//
// Never point this at production.
import { buildPostPayload, getRepostStripRect, ComposerSnapshot } from '../src/utils/buildPostPayload';
import { toCanvasState } from '../src/utils/canvasState';
import { CanvasTextElement } from '../src/types/canvas';
import { FontChoice } from '../src/types';

const API = process.env.API || 'http://localhost:8001';
if (/creativemindsideasmagazine|type-media/.test(API)) throw new Error('refusing to seed production');
const W = 440; // iPhone 16 Pro Max, points
const H = 956;

let nextId = 1;
const el = (content: string, opts: Partial<CanvasTextElement> & { fontFamily: FontChoice }): CanvasTextElement => ({
  id: String(nextId++), content, x: W / 2, y: H / 2, originalX: null, originalY: null,
  fontSize: 30, color: '#000000', hasBackground: false, backgroundColor: '#FFFFFF',
  backgroundMode: 'off', capsLock: false, scale: 1, letterSpacing: 0, glow: false,
  rainbow: false, align: 'center', bold: false, italic: false, underline: false,
  listStyle: 'none', ...opts,
});

const snapshot = (background: string, textElements: CanvasTextElement[], extra: Partial<ComposerSnapshot> = {}) => ({
  screenWidth: W, screenHeight: H, textElements, stickerElements: [],
  backgroundColor: background, backgroundGradient: [] as string[], backgroundImage: null,
  imageBackgroundScale: 1, imageBackgroundPosition: { x: 0, y: 0 }, imageCoverScale: 1,
  cropTop: 0, cropBottom: H, isSigned: false, ...extra,
});

async function post(device: string, snap: ReturnType<typeof snapshot>) {
  const body = { ...buildPostPayload(snap as ComposerSnapshot), canvas_state: toCanvasState(snap as any) };
  const res = await fetch(`${API}/api/posts/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Id': device },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function quote(device: string, original: any, background: string, caption: CanvasTextElement) {
  const repostData = { originalPost: original, screenshotUri: original.rendered_image_url };
  const strip = getRepostStripRect(original, W, H)!;
  caption.y = Math.min(H * 0.34, strip.top - 32); // where the composer seeds a caption
  return post(device, snapshot(background, [caption], { repostData, repostStripRect: strip }));
}

async function main() {
  // Oldest first: the feed shows the last one on top.
  const a = await post('seed-ines', snapshot('#F0FF00', [
    el('every post is a page\nin one long magazine', { fontFamily: 'courier-prime', fontSize: 26, color: '#000000', y: 430 }),
  ]));
  const b = await quote('seed-otto', a, '#0000EE',
    el('AND EVERY QUOTE\nIS A PAGE INSIDE\nA PAGE', { fontFamily: 'arial-black', fontSize: 28, color: '#F8F8FF' }));
  await quote('seed-maru', b, '#FAEBD7',
    el('pages all the way down', { fontFamily: 'crimson-text', fontSize: 34, color: '#FF1A1A', italic: true }));

  await post('seed-otto', snapshot('#F0FF00', [
    el('yes, papyrus.', { fontFamily: 'papyrus', fontSize: 44, alternateColors: ['#FF1493', '#0000EE'], y: 460 }),
  ]));
  await post('seed-ines', snapshot('#FF1A1A', [], {
    backgroundGradient: ['#FF1A1A', '#FF9500', '#FFD700', '#32CD32', '#00CED1', '#9932CC'],
    textElements: [el('TYPE', { fontFamily: 'impact', fontSize: 96, color: '#F8F8FF', y: 470 })],
  }));
  await post('seed-maru', snapshot('#FF90C2', [
    el('i typed this at 3am\nand it looks incredible', {
      fontFamily: 'caveat', fontSize: 36, color: '#0000EE', backgroundMode: 'white', hasBackground: true, y: 470,
    }),
  ]));
  await post('seed-otto', snapshot('#000000', [
    el('colours from\nthe old internet', { fontFamily: 'arial-black', fontSize: 34, rainbow: true, y: 470 }),
  ]));
  await post('seed-maru', snapshot('#FAEBD7', [
    el('no likes. no followers.\nno algorithm.\nthe newest page is on top.', {
      fontFamily: 'crimson-text', fontSize: 28, color: '#690016', italic: true, y: 470,
    }),
  ]));
  await post('seed-ines', snapshot('#FF1A1A', [
    el('WRITE A LINE.\nIT BECOMES\nA PAGE.', { fontFamily: 'arial-black', fontSize: 40, color: '#F8F8FF', y: 470 }),
  ]));
  console.log('seeded 9 posts');
}

main().catch(e => { console.error(e); process.exit(1); });
