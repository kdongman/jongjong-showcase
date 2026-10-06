import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { LEGAL_CANONICAL_ORIGIN, LEGAL_DOCUMENT_FILES, LEGAL_PUBLIC_PATHS } from './legalRoutes';

test('legal public paths map to static HTML files that exist in public/', () => {
  assert.deepEqual(LEGAL_PUBLIC_PATHS, ['/support', '/privacy', '/terms']);
  assert.equal(LEGAL_CANONICAL_ORIGIN, 'https://jongjong.app');
  for (const path of LEGAL_PUBLIC_PATHS) {
    const file = LEGAL_DOCUMENT_FILES[path];
    assert.match(file, /^\/(support|privacy|terms)\/index\.html$/);
    const onDisk = fileURLToPath(new URL(`../../public${file}`, import.meta.url));
    assert.equal(existsSync(onDisk), true, `missing ${onDisk}`);
    const html = readFileSync(onDisk, 'utf8');
    assert.match(html, /<title>/i);
    assert.match(html, new RegExp(`canonical" href="${LEGAL_CANONICAL_ORIGIN}${path}"`));
  }
});

test('Vercel rewrites serve legal pages before the photobooth SPA fallback', () => {
  const vercel = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'),
  ) as { rewrites: Array<{ source: string; destination: string }> };
  const sources = vercel.rewrites.map((rule) => rule.source);
  for (const path of LEGAL_PUBLIC_PATHS) {
    const legalIndex = sources.indexOf(path);
    const spaIndex = sources.lastIndexOf('/(.*)');
    assert.notEqual(legalIndex, -1, `missing rewrite for ${path}`);
    assert.notEqual(spaIndex, -1);
    assert.ok(legalIndex < spaIndex, `${path} rewrite must precede SPA fallback`);
    assert.equal(vercel.rewrites[legalIndex]?.destination, LEGAL_DOCUMENT_FILES[path]);
  }
});
