import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8');

/** Extrae los nombres de variables --c-* definidos dentro de un bloque. */
function varsInBlock(selector: string): string[] {
  const start = css.indexOf(`${selector} {`);
  expect(start, `bloque ${selector} presente`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  const block = css.slice(start, end);
  return [...block.matchAll(/--c-[\w-]+/g)].map((m) => m[0]).sort();
}

describe('tokens.css', () => {
  it('light and dark define the SAME token set (parity)', () => {
    const light = varsInBlock(':root');
    const dark = varsInBlock('.dark');
    expect(light.length).toBeGreaterThanOrEqual(17);
    expect(dark).toEqual(light);
  });

  it('every token is exposed to Tailwind via @theme inline', () => {
    for (const token of varsInBlock(':root')) {
      expect(css, token).toContain(`var(${token})`);
    }
  });

  it('includes the new warn/info tokens in both themes', () => {
    for (const t of ['--c-warn', '--c-warn-soft', '--c-info', '--c-info-soft']) {
      expect(varsInBlock(':root')).toContain(t);
      expect(varsInBlock('.dark')).toContain(t);
    }
  });
});
