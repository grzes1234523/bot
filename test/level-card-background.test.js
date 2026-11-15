import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseLevelCardBackground, generateLevelBackground, imageFormat, proceduralBackground, validateLevelCardImage } from '../src/level-card-background.js';
import { cachedGuildBackground, clearGuildBackgroundCache } from '../src/level-card.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('walidacja tła akceptuje PNG, JPG i WebP, a odrzuca zły plik i za duży rozmiar', () => {
  const png = validateLevelCardImage({ data: PNG.toString('base64'), mime: 'image/png' });
  assert.equal(png.mime, 'image/png');
  assert.equal(imageFormat(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16)])).mime, 'image/jpeg');
  const webp = Buffer.alloc(16);
  webp.write('RIFF', 0); webp.write('WEBP', 8);
  assert.equal(imageFormat(webp).mime, 'image/webp');
  assert.throws(() => validateLevelCardImage({ data: Buffer.from('to nie jest obraz').toString('base64') }), /PNG, JPG/);
  assert.throws(() => validateLevelCardImage({ data: '@@@' }), /4 MB/);
});

test('generator proceduralny zwraca PNG dla opisu po polsku', async () => {
  for (const prompt of ['fioletowy kosmos z gwiazdami', 'czerwony ogień', 'zielone miasto cyber', 'złoty minecraft piksel']) {
    const png = await proceduralBackground(prompt);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
  const generated = await generateLevelBackground('różowy kosmos');
  assert.equal(imageFormat(generated).mime, 'image/png');
});

test('kolejność tła: serwer, plik, adres, gradient', () => {
  assert.equal(chooseLevelCardBackground({ stored: true, file: '/a.png', url: 'https://cdn.example/tlo.png' }), 'guild');
  assert.equal(chooseLevelCardBackground({ stored: false, file: '/a.png', url: 'https://cdn.example/tlo.png' }), 'file');
  assert.equal(chooseLevelCardBackground({ url: 'https://cdn.example/tlo.png' }), 'url');
  assert.equal(chooseLevelCardBackground({}), 'gradient');
});

test('pamięć tła serwera odświeża się przy nowej wersji', async () => {
  clearGuildBackgroundCache();
  let calls = 0;
  const load = async () => ({ id: ++calls });
  const state = { levelCardBackgrounds: { g: { saved: { data: PNG.toString('base64'), version: 1 } } } };
  assert.equal((await cachedGuildBackground('g', state, load)).id, 1);
  assert.equal((await cachedGuildBackground('g', state, load)).id, 1);
  state.levelCardBackgrounds.g.saved = { ...state.levelCardBackgrounds.g.saved, version: 2 };
  assert.equal((await cachedGuildBackground('g', state, load)).id, 2);
  state.levelCardBackgrounds.g.saved = null;
  assert.equal(await cachedGuildBackground('g', state, load), null);
});
