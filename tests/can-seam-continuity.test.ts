import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import * as THREE from 'three';
import { createCanModel } from '../src/components/catalog/can-model';
import { applyCanReference } from '../src/components/catalog/can-reference';

async function readTexture(filename: string) {
  const { data, info } = await sharp(filename).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const texture = new THREE.DataTexture(new Uint8Array(data), info.width, info.height, THREE.RGBAFormat);
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function rearAtlas(slug: string) {
  const filename = `public/images/labels/${slug}.png`;
  const info = await sharp(filename).metadata();
  const rear = await sharp(filename).extract({ left: info.width! / 2, top: 0, width: info.width! / 2, height: info.height! })
    .resize(768, 1536, { fit: 'fill', kernel: 'cubic' }).ensureAlpha().raw().toBuffer();
  const data = new Uint8Array(1536 * 1536 * 4);
  for (let y = 0; y < 1536; y++) {
    for (let x = 0; x < 768; x++) data.set([3, 7, 11, 255], (y * 1536 + x) * 4);
    data.set(rear.subarray(y * 768 * 4, (y + 1) * 768 * 4), (y * 1536 + 768) * 4);
  }
  const texture = new THREE.DataTexture(data, 1536, 1536, THREE.RGBAFormat);
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Independent texture read matching GPU texel centres and sRGB filtering. */
function shaderRgb(texture: THREE.DataTexture, uv: readonly number[]) {
  const image = texture.image as { data: Uint8Array; width: number; height: number };
  const { data, width, height } = image;
  const x = Math.max(0, Math.min(width - 1, uv[0] * width - .5));
  const y = Math.max(0, Math.min(height - 1, (texture.flipY ? 1 - uv[1] : uv[1]) * height - .5));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const decode = (byte: number) => { const value = byte / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; };
  const encode = (value: number) => 255 * (value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055);
  return [0, 1, 2].map(channel => {
    const a = decode(data[(y0 * width + x0) * 4 + channel]) * (1 - x + x0) + decode(data[(y0 * width + x1) * 4 + channel]) * (x - x0);
    const b = decode(data[(y1 * width + x0) * 4 + channel]) * (1 - x + x0) + decode(data[(y1 * width + x1) * 4 + channel]) * (x - x0);
    return encode(a * (1 - y + y0) + b * (y - y0));
  });
}

describe('photograph-to-side continuity using the approved can PNGs', () => {
  for (const slug of ['original', 'citricos', 'tropicais', 'frutas-vermelhas']) {
    it(`${slug}: both turn seams retain the same source colours through body, shoulder and foot`, async () => {
      const front = await readTexture(`public/images/cans/${slug}.png`);
      const side = await readTexture(`public/images/can-sides/${slug}.png`);
      const back = await rearAtlas(slug), model = createCanModel(back, '#00A7AB');
      try {
        applyCanReference(model, front, back, side);
        const geometry = model.label.geometry, position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
        const materials = model.label.material as THREE.MeshBasicMaterial[];
        type Edge = { material: number; indices: [number, number] };
        const edges = new Map<string, Edge[]>();
        const vertexKey = (index: number) => [position.getX(index), position.getY(index), position.getZ(index)]
          .map(value => (Math.abs(value) < .000005 ? 0 : value).toFixed(5)).join(',');
        for (const group of geometry.groups) for (let start = group.start; start < group.start + group.count; start += 3) {
          for (const [a, b] of [[start, start + 1], [start + 1, start + 2], [start + 2, start]]) {
            const ka = vertexKey(a), kb = vertexKey(b), key = [ka, kb].sort().join('|');
            const entries = edges.get(key) ?? [];
            entries.push({ material: group.materialIndex!, indices: ka < kb ? [a, b] : [b, a] });
            edges.set(key, entries);
          }
        }
        const samples: { height: number; delta: number }[] = [];
        const sides = new Set<number>();
        for (const entries of edges.values()) {
          if (entries.length !== 2) continue;
          const photoEdge = entries.find(edge => edge.material === 0), sideEdge = entries.find(edge => edge.material === 2);
          if (!photoEdge || !sideEdge) continue;
          sides.add(Math.sign(position.getX(photoEdge.indices[0])));
          for (const t of [0, .25, .5, .75, 1]) {
            const interpolate = (edge: Edge) => [
              uv.getX(edge.indices[0]) * (1 - t) + uv.getX(edge.indices[1]) * t,
              uv.getY(edge.indices[0]) * (1 - t) + uv.getY(edge.indices[1]) * t,
            ];
            const a = shaderRgb(materials[0].map as THREE.DataTexture, interpolate(photoEdge));
            const b = shaderRgb(materials[2].map as THREE.DataTexture, interpolate(sideEdge));
            samples.push({
              height: position.getY(photoEdge.indices[0]) * (1 - t) + position.getY(photoEdge.indices[1]) * t,
              delta: Math.max(...a.map((channel, index) => Math.abs(channel - b[index]))),
            });
          }
        }
        expect(sides).toEqual(new Set([-1, 1]));
        expect(samples.length).toBeGreaterThan(100);
        for (const zone of ['body', 'shoulder', 'base']) {
          const region = samples.filter(sample => zone === 'shoulder' ? sample.height > 1.48 : zone === 'base' ? sample.height < -1.52 : sample.height >= -1.52 && sample.height <= 1.48);
          const mean = region.reduce((sum, sample) => sum + sample.delta, 0) / region.length;
          const maximum = Math.max(...region.map(sample => sample.delta));
          expect(region.length, `${slug} ${zone} coverage`).toBeGreaterThan(0);
          // Narrow lightning peaks incur sub-texel resampling at the shoulder;
          // a repeated white-core seam previously differed by over200RGB.
          expect(mean, `${slug} ${zone} mean seam difference`).toBeLessThan(zone === 'shoulder' ? 8 : 5);
          expect(maximum, `${slug} ${zone} maximum seam difference`).toBeLessThan(zone === 'shoulder' ? 80 : 20);
        }
      } finally { model.dispose(); front.dispose(); back.dispose(); side.dispose(); }
    });
  }
});
