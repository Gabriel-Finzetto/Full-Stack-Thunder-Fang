import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { messages } from '../src/i18n/messages';
import { helpArticles } from '../src/components/help-content';
function files(directory: string): string[] { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith('.tsx') ? [join(directory, entry.name)] : []); }
describe('traduções do frontend', () => {
  it('cobre os artigos pesquisáveis da central em todos os idiomas', () => {
    for (const article of helpArticles) for (const key of [article.category,article.title,article.body,article.technical]) expect(messages[key],key).toHaveLength(3);
  });
  it('tem três traduções não vazias em cada entrada', () => { for (const values of Object.values(messages)) { expect(values).toHaveLength(3); expect(values.every(value => Boolean(value.trim()))).toBe(true); } });
  it('cobre as chamadas literais de tradução das telas', () => {
    const missing = new Set<string>();
    for (const file of files('src')) for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*(['"])([^'"\n]+)\1\s*\)/g)) if (!(match[2] in messages)) missing.add(match[2]);
    expect([...missing].sort()).toEqual([]);
  });
});
