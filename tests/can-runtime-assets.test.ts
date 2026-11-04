import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import sharp from 'sharp';
import manifest from '../src/components/catalog/can-textures.generated.json';

type Pixels = { data: Buffer; info: { width: number; height: number; channels: number } };
const { verifyPixels } = createRequire(import.meta.url)('../scripts/prepare-can-textures.cjs') as {
  verifyPixels(expected: Pixels, actual: Pixels): void;
};
const root = path.resolve(import.meta.dirname, '..');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('lossless can runtime artwork', () => {
  it('keeps approved pixels and current source hashes for all four fronts, reverse panels and sides', async () => {
    for (const textures of Object.values(manifest.textures)) for (const asset of Object.values(textures)) {
      const source = await readFile(path.join(root, asset.source));
      const output = await readFile(path.join(root, 'public', asset.url.slice(1)));
      expect(sha(source)).toBe(asset.sourceSha256);
      expect(sha(output)).toBe(asset.outputSha256);
      let pipeline = sharp(source);
      if ('crop' in asset) pipeline = pipeline.extract(asset.crop);
      const before = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject:true });
      const after = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
      expect(() => verifyPixels(before, after)).not.toThrow();
      expect(after.info.width).toBe(asset.width);
      expect(after.info.height).toBe(asset.height);
    }
  }, 30_000);

  it('rejects changed color, transparency or dimensions, including hidden RGB', () => {
    const expected: Pixels = { data:Buffer.from([70, 80, 90, 255, 10, 20, 30, 0]), info:{ width:2, height:1, channels:4 } };
    for (const index of [0, 3, 4, 7]) {
      const changed = Buffer.from(expected.data); changed[index] ^= 1;
      expect(() => verifyPixels(expected, { ...expected, data:changed })).toThrow();
    }
    expect(() => verifyPixels(expected, { ...expected, info:{ width:1, height:2, channels:4 } })).toThrow();
  });
});
