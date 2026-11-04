import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCanModel } from '../src/components/catalog/can-model';
import { applyCanReference, canPhotographAngle, CAN_REFERENCE_ELEVATION, CAN_REFERENCE_FRONT_ARC } from '../src/components/catalog/can-reference';
import { canTiltX, canTiltY, canTiltZ } from '../src/domain/orbit';

function photograph() {
  const width = 10, height = 16, pixels = new Uint8Array(width * height * 4);
  for (let y = 2; y < 15; y++) for (let x = 2; x < 8; x++) pixels.set([x * 20, y * 12, 72, 254], (y * width + x) * 4);
  // Faint antialiasing is not a physical part of the can.
  pixels.set([255, 255, 255, 80], 0);
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.flipY = true; texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A narrow shoulder and a cyan photographed tab over grey brushed metal. */
function metalPhotograph() {
  const width = 256, height = 384, pixels = new Uint8Array(width * height * 4);
  for (let y = 12; y < 376; y++) {
    const left = y < 96 ? 58 : 32, right = y < 96 ? 198 : 224;
    for (let x = left; x < right; x++) {
      const metal = 70 + Math.floor(x / 3) + y % 5;
      const tab = x >= 104 && x <= 152 && y >= 15 && y <= 30;
      pixels.set(tab ? [0, 240, 240, 254] : [metal, metal, metal, 254], (y * width + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.flipY = true; texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function materials(mesh: THREE.Mesh) { return Array.isArray(mesh.material) ? mesh.material : [mesh.material]; }
const photographedMetal = new Set(['top-rolled-rim', 'bottom-rolled-rim', 'brushed-aluminium-foot']);

/** Include the character centre and close neighbours on either side of 90°. */
function sampledLabel() {
  const angles = [-150, -120, -90.01, -90, -89.99, -60, -30, 0, 30, 60, 89.99, 90, 90.01, 120, 150];
  const heights = [-1.7, -1.64, -1.58, -1.52, 0, 1.48, 1.55, 1.62, 1.7];
  const positions: number[] = [];
  for (const height of heights) for (const degrees of angles) {
    const angle = THREE.MathUtils.degToRad(degrees);
    positions.push(.74 * Math.sin(angle), height, .74 * Math.cos(angle));
  }
  const indices: number[] = [];
  for (let row = 0; row < heights.length - 1; row++) for (let column = 0; column < angles.length - 1; column++) {
    const a = row * angles.length + column, b = a + angles.length;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(positions.length / 3 * 2, 2));
  geometry.setIndex(indices);
  const front = photograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
  model.label.geometry.dispose(); model.label.geometry = geometry;
  applyCanReference(model, front, back);
  const position = model.label.geometry.getAttribute('position'), uv = model.label.geometry.getAttribute('uv');
  const at = (degrees: number, height: number, materialIndex?: number) => {
    for (let index = 0; index < position.count; index++) {
      if (materialIndex !== undefined && !model.label.geometry.groups.some(group => group.materialIndex === materialIndex && index >= group.start && index < group.start + group.count)) continue;
      const angle = THREE.MathUtils.radToDeg(Math.atan2(position.getX(index), position.getZ(index)));
      if (Math.abs(angle - degrees) < .0001 && Math.abs(position.getY(index) - height) < .00001) return new THREE.Vector2(uv.getX(index), uv.getY(index));
    }
    throw new Error(`Missing label sample at ${degrees}°, ${height}`);
  };
  return { angles, at, dispose() { model.dispose(); front.dispose(); back.dispose(); } };
}

describe('approved can photographic surface', () => {
  it('keeps complete texture sectors and puts shared seams on meridians rather than diagonal half-quads', () => {
    const front = photograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    const original = model.label.geometry;
    const originalVertices = new Set(Array.from({length: original.getAttribute('position').count}, (_, index) => {
      const p = original.getAttribute('position');
      return [p.getX(index), p.getY(index), p.getZ(index)].map(value => Math.round(value * 1e6)).join(',');
    }));
    try {
      applyCanReference(model, front, back);
      const geometry = model.label.geometry, p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      const edges = new Map<string, { materials: Set<number>; angles: number[] }>();
      for (const group of geometry.groups) for (let start = group.start; start < group.start + group.count; start += 3) {
        const material = group.materialIndex!;
        const angles = [0,1,2].map(offset => Math.abs(Math.atan2(p.getX(start + offset), p.getZ(start + offset))));
        for (let offset = 0; offset < 3; offset++) {
          const index = start + offset;
          const key = [p.getX(index), p.getY(index), p.getZ(index)].map(value => Math.round(value * 1e6)).join(',');
          expect(originalVertices.has(key)).toBe(true);
          expect(Number.isFinite(uv.getX(index)) && Number.isFinite(uv.getY(index))).toBe(true);
          if (material === 0) expect(angles[offset]).toBeLessThanOrEqual(Math.PI / 2 + 1e-6);
          if (material === 2) {
            expect(angles[offset]).toBeGreaterThanOrEqual(Math.PI / 2 - 1e-6);
            expect(angles[offset]).toBeLessThanOrEqual(CAN_REFERENCE_FRONT_ARC + 1e-6);
          }
          if (material === 1) expect(angles[offset]).toBeGreaterThanOrEqual(CAN_REFERENCE_FRONT_ARC - 1e-6);
          const other = start + (offset + 1) % 3;
          const otherKey = [p.getX(other), p.getY(other), p.getZ(other)].map(value => Math.round(value * 1e6)).join(',');
          const edgeKey = [key, otherKey].sort().join('|');
          const edge = edges.get(edgeKey) ?? { materials: new Set<number>(), angles: [angles[offset], angles[(offset + 1) % 3]] };
          edge.materials.add(material); edges.set(edgeKey, edge);
        }
      }
      let photoSeams = 0, rearSeams = 0;
      for (const edge of edges.values()) if (edge.materials.size > 1) {
        expect(edge.materials.has(2)).toBe(true);
        const boundary = edge.materials.has(0) ? Math.PI / 2 : CAN_REFERENCE_FRONT_ARC;
        for (const angle of edge.angles) expect(angle).toBeCloseTo(boundary, 5);
        if (edge.materials.has(0)) photoSeams++; else rearSeams++;
      }
      expect(photoSeams).toBeGreaterThan(0); expect(rearSeams).toBeGreaterThan(0);
    } finally { model.dispose(); front.dispose(); back.dispose(); }
  });
  it('keeps the opener cap as bright and saturated as the approved reference', () => {
    const front = metalPhotograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    try {
      applyCanReference(model, front, back);
      const tab = model.group.getObjectByName('coloured-pull-tab') as THREE.Mesh;
      const [cap, edge] = materials(tab) as [THREE.MeshBasicMaterial, THREE.MeshStandardMaterial];
      expect(cap).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(cap.color.getHexString()).toBe('ffffff');
      const finish = cap.map as THREE.DataTexture;
      expect(finish.name).toBe('approved-anodised-tab-finish');
      const finishPixels = finish.image.data as Uint8Array;
      for (let offset = 0; offset < finishPixels.length; offset += 4) expect([...finishPixels.slice(offset, offset + 4)]).toEqual([0, 240, 240, 255]);
      expect(cap.toneMapped).toBe(false);
      expect(edge).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(((tab.geometry as THREE.ExtrudeGeometry).parameters.shapes as THREE.Shape).holes).toHaveLength(2);
    } finally { model.dispose(); front.dispose(); back.dispose(); }
  });
  it('reuses the approved finish on three metal bands while retaining native lid, tab and other hardware', () => {
    const front = photograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    const hardware = new Map<THREE.Mesh, { material: THREE.Material | THREE.Material[]; geometry: THREE.BufferGeometry; uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; positions: number[] }>();
    model.group.traverse(object => {
      if (object instanceof THREE.Mesh && object !== model.label) hardware.set(object, {
        material: object.material, geometry: object.geometry, uv: object.geometry.getAttribute('uv'),
        positions: Array.from(object.geometry.getAttribute('position').array),
      });
    });
    try {
      const result = applyCanReference(model, front, back);
      expect(CAN_REFERENCE_ELEVATION).toBeCloseTo(THREE.MathUtils.degToRad(8), 10);
      expect(result.imageBounds).toEqual({ width: 10, height: 16, left: 2, top: 2, right: 8, bottom: 15, opaqueWidth: 6, opaqueHeight: 13 });
      const photo = (model.label.material as THREE.MeshBasicMaterial[])[0].map!;
      const mappedParts: string[] = [];
      for (const [mesh, original] of hardware) {
        expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(original.positions);
        if (photographedMetal.has(mesh.name)) {
          mappedParts.push(mesh.name);
          expect(mesh.geometry).not.toBe(original.geometry);
          expect(mesh.geometry.getAttribute('uv')).not.toBe(original.uv);
          const material = mesh.material as THREE.MeshBasicMaterial;
          expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
          expect(material.map).toBe(photo);
          expect(material.color.getHex()).toBe(0xffffff);
          expect(material.toneMapped).toBe(false);
          continue;
        }
        expect(mesh.geometry).toBe(original.geometry);
        expect(mesh.geometry.getAttribute('uv')).toBe(original.uv);
        if (mesh.name === 'lid') {
          const material = mesh.material as THREE.MeshBasicMaterial;
          expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
          expect(material.map).not.toBe(photo);
          expect(material.map!.image).toMatchObject({ width: 512, height: 512 });
          expect(material.color.getHex()).toBe(0xffffff);
          expect(material.toneMapped).toBe(false);
          continue;
        }
        expect(mesh.material).toBe(original.material);
        for (const [index, material] of materials(mesh).entries()) {
          expect(material).toBeInstanceOf(mesh.name === 'coloured-pull-tab' && index === 0 ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial);
          expect((material as THREE.MeshStandardMaterial).map).toBeNull();
        }
      }
      expect(mappedParts.sort()).toEqual([...photographedMetal].sort());
      const lid = model.group.getObjectByName('lid') as THREE.Mesh;
      const tab = model.group.getObjectByName('coloured-pull-tab') as THREE.Mesh<THREE.ExtrudeGeometry>;
      expect(lid.geometry).toBe(hardware.get(lid)!.geometry);
      expect(tab.geometry).toBe(hardware.get(tab)!.geometry);
      const tabShape = tab.geometry.parameters.shapes as THREE.Shape;
      expect(tabShape.holes).toHaveLength(2);
      for (const material of materials(tab)) expect((material as THREE.MeshStandardMaterial).map).toBeNull();
      const label = model.label, material = (label.material as THREE.MeshBasicMaterial[])[0];
      expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(material.map).not.toBe(front);
      expect(material.color.getHex()).toBe(0xffffff);
      expect(material.toneMapped).toBe(false);
      const positions = label.geometry.getAttribute('position'), uv = label.geometry.getAttribute('uv');
      const sample = Array.from({ length: positions.count }, (_, index) => index).find(index =>
        Math.abs(Math.atan2(positions.getX(index), positions.getZ(index))) < Math.PI / 3 && Math.abs(positions.getY(index)) < 1.53,
      )!;
      expect(sample).toBeDefined();
      const fractionX = (positions.getX(sample) - result.bounds.minX) / result.bounds.width;
      const fractionY = (result.bounds.maxY - positions.getY(sample) * Math.cos(CAN_REFERENCE_ELEVATION) + positions.getZ(sample) * Math.sin(CAN_REFERENCE_ELEVATION)) / result.bounds.height;
      expect(uv.getX(sample)).toBeCloseTo((2 + fractionX * 6) / 10, 6);
      expect(uv.getY(sample)).toBeCloseTo(1 - (2 + fractionY * 13) / 16, 6);
    } finally { model.dispose(); front.dispose(); back.dispose(); }
  });

  it('copies the real anodised highlight variation without baking holes or changing geometry and releases only its derived finish', () => {
    const front = metalPhotograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    const pixels = front.image.data as Uint8Array, allowed = new Set<string>();
    for (let y = 15; y <= 30; y++) for (let x = 104; x <= 152; x++) {
      const rgb = [0, 145 + x - 104, 195 + x - 104];
      pixels.set([...rgb, 254], (y * front.image.width + x) * 4);
      allowed.add(rgb.join(','));
    }
    pixels.set([250, 255, 255, 254], (20 * front.image.width + 120) * 4);
    allowed.add('250,255,255');
    pixels.set([60, 60, 60, 254], (20 * front.image.width + 128) * 4);
    const originalPixels = new Uint8Array(pixels);
    const tab = model.group.getObjectByName('coloured-pull-tab') as THREE.Mesh<THREE.ExtrudeGeometry>;
    const geometry = tab.geometry, originalPositions = Array.from(geometry.getAttribute('position').array);
    const sourceDisposals = [vi.spyOn(front, 'dispose'), vi.spyOn(back, 'dispose')];
    applyCanReference(model, front, back);
    const finish = (materials(tab)[0] as THREE.MeshBasicMaterial).map as THREE.DataTexture;
    const derivedDisposal = vi.spyOn(finish, 'dispose');
    try {
      expect(tab.geometry).toBe(geometry);
      expect(Array.from(geometry.getAttribute('position').array)).toEqual(originalPositions);
      expect((geometry.parameters.shapes as THREE.Shape).holes).toHaveLength(2);
      expect(finish.colorSpace).toBe(front.colorSpace); expect(finish.flipY).toBe(front.flipY);
      const colours = new Set<string>();
      const finishPixels = finish.image.data as Uint8Array;
      for (let offset = 0; offset < finishPixels.length; offset += 4) {
        const rgb = [...finishPixels.slice(offset, offset + 3)].join(',');
        expect(allowed.has(rgb), `Tab finish introduced ${rgb}`).toBe(true);
        expect(finishPixels[offset + 3]).toBe(255);
        colours.add(rgb);
      }
      expect(colours.size).toBeGreaterThan(8);
      expect(colours.has('250,255,255')).toBe(true);
      expect(front.image.data).toEqual(originalPixels);
      model.group.updateMatrixWorld(true);
      const throughFingerHole = new THREE.Raycaster(new THREE.Vector3(0, 3, -.08), new THREE.Vector3(0, -1, 0));
      expect(throughFingerHole.intersectObject(tab)).toHaveLength(0);
    } finally { model.dispose(); model.dispose(); }
    expect(derivedDisposal).toHaveBeenCalledTimes(1);
    for (const dispose of sourceDisposals) expect(dispose).not.toHaveBeenCalled();
    front.dispose(); back.dispose();
  });

  it('keeps approved body and band RGB in one opaque source copy without cutting any can surface', () => {
    const front = photograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    const originalPixels = new Uint8Array(front.image.data as Uint8Array);
    try {
      applyCanReference(model, front, back);
      const derived = (model.label.material as THREE.MeshBasicMaterial[])[0].map as THREE.DataTexture;
      expect(derived.colorSpace).toBe(front.colorSpace); expect(derived.flipY).toBe(front.flipY);
      const pixels = derived.image.data as Uint8Array;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        expect(pixels[offset + 3]).toBe(255);
        if (originalPixels[offset + 3] > 128) expect([...pixels.slice(offset, offset + 3)]).toEqual([...originalPixels.slice(offset, offset + 3)]);
      }
      expect([...pixels.slice(200, 204)]).toEqual([40, 60, 72, 255]);
      expect([...pixels.slice(236, 240)]).toEqual([140, 60, 72, 255]);
      expect(front.image.data).toEqual(originalPixels);
      const photoMaps = new Set<THREE.Texture>();
      model.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of materials(object)) {
          expect(material.transparent).toBe(false); expect(material.alphaTest).toBe(0); expect(material.opacity).toBe(1);
          if (material instanceof THREE.MeshBasicMaterial && material.map && material.map !== back) photoMaps.add(material.map);
        }
      });
      const lidMap = ((model.group.getObjectByName('lid') as THREE.Mesh).material as THREE.MeshBasicMaterial).map!;
      const sideMap = (model.label.material as THREE.MeshBasicMaterial[])[2].map!;
      expect(photoMaps).toEqual(new Set([derived, lidMap, sideMap]));
    } finally { model.dispose(); front.dispose(); back.dispose(); }
  });

  it('samples the fully calibrated shoulder inside each real opaque source row', () => {
    const front = metalPhotograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    try {
      applyCanReference(model, front, back);
      const position = model.label.geometry.getAttribute('position'), uv = model.label.geometry.getAttribute('uv');
      const { width, height } = front.image;
      const data = front.image.data as Uint8Array;
      let shoulderSamples = 0;
      for (const group of model.label.geometry.groups) {
        if (group.materialIndex !== 0) continue;
        for (let index = group.start; index < group.start + group.count; index++) {
          if (position.getY(index) < 1.52 - 1e-6) continue;
          const x = Math.round(uv.getX(index) * width), y = Math.round((1 - uv.getY(index)) * height);
          expect(data[(y * width + x) * 4 + 3], `Transparent shoulder source at ${x},${y}`).toBeGreaterThan(128);
          shoulderSamples++;
        }
      }
      expect(shoulderSamples).toBeGreaterThan(100);
    } finally { model.dispose(); front.dispose(); back.dispose(); }
  });

  it('cleans the baked cyan tab from the lid using neighbouring source metal and leaves the physical tab untouched', () => {
    const front = metalPhotograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    const originalPixels = new Uint8Array(front.image.data as Uint8Array);
    const lid = model.group.getObjectByName('lid') as THREE.Mesh;
    const tab = model.group.getObjectByName('coloured-pull-tab') as THREE.Mesh;
    const lidGeometry = lid.geometry, lidUv = lidGeometry.getAttribute('uv'), tabGeometry = tab.geometry, tabMaterial = tab.material;
    try {
      applyCanReference(model, front, back);
      expect(lid.geometry).toBe(lidGeometry); expect(lid.geometry.getAttribute('uv')).toBe(lidUv);
      expect(tab.geometry).toBe(tabGeometry); expect(tab.material).toBe(tabMaterial);
      expect((materials(tab)[0] as THREE.MeshBasicMaterial).map?.name).toBe('approved-anodised-tab-finish');
      expect((materials(tab)[1] as THREE.MeshStandardMaterial).map).toBeNull();
      const texture = (lid.material as THREE.MeshBasicMaterial).map as THREE.DataTexture;
      expect(texture.colorSpace).toBe(front.colorSpace);
      expect(texture.image).toMatchObject({ width: 512, height: 512 });
      const pixels = texture.image.data as Uint8Array, shades = new Set<number>();
      let invalidPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset] !== pixels[offset + 1] || pixels[offset] !== pixels[offset + 2] || pixels[offset + 3] !== 255) invalidPixels++;
        shades.add(pixels[offset]);
      }
      expect(invalidPixels).toBe(0);
      expect(shades.size).toBeGreaterThan(30);
      expect(originalPixels.some((value, index) => index % 4 === 1 && value === 240)).toBe(true);
      expect(front.image.data).toEqual(originalPixels);
    } finally { model.dispose(); front.dispose(); back.dispose(); }
  });

  it('keeps the photograph on its real front half, background on both sides, and original rear UVs', () => {
    const front = photograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    const original = model.label.geometry.toNonIndexed(), oldUv = original.getAttribute('uv');
    try {
      applyCanReference(model, front, back);
      expect(CAN_REFERENCE_FRONT_ARC).toBeCloseTo(THREE.MathUtils.degToRad(150), 10);
      expect(model.label.geometry.index).toBeNull();
      const material = model.label.material as THREE.MeshBasicMaterial[];
      expect(material[1].map).toBe(back); expect(material[1].toneMapped).toBe(false);
      const positions = model.label.geometry.getAttribute('position'), uv = model.label.geometry.getAttribute('uv');
      let total = 0, previousIndex = -1;
      const selected = new Set<number>();
      for (const group of model.label.geometry.groups) {
        expect(group.start).toBe(total); expect(group.count % 3).toBe(0); expect(group.materialIndex).not.toBe(previousIndex);
        for (let start = group.start; start < group.start + group.count; start += 3) {
          if (group.materialIndex === 1) for (let index = start; index < start + 3; index++) {
            expect(uv.getX(index)).toBe(oldUv.getX(index)); expect(uv.getY(index)).toBe(oldUv.getY(index));
          }
        }
        selected.add(group.materialIndex!); total += group.count; previousIndex = group.materialIndex!;
      }
      expect(selected).toEqual(new Set([0, 1, 2])); expect(total).toBe(positions.count);
    } finally { original.dispose(); model.dispose(); front.dispose(); back.dispose(); }
  });

  it('keeps the rear information hidden throughout the actual can motion', () => {
    const front = photograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    try {
      applyCanReference(model, front, back);
      const positions = model.label.geometry.getAttribute('position');
      const view = new THREE.Vector3(0, Math.sin(CAN_REFERENCE_ELEVATION), Math.cos(CAN_REFERENCE_ELEVATION));
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
      for (const progress of [0, .266, 1 / 3, .5, 2 / 3, .734, 1]) {
        model.group.rotation.set(
          THREE.MathUtils.degToRad(canTiltX(progress)),
          THREE.MathUtils.degToRad(canTiltY(progress)),
          THREE.MathUtils.degToRad(canTiltZ(progress)),
        );
        model.group.updateWorldMatrix(true, true);
        let visible = 0;
        for (const group of model.label.geometry.groups) for (let index = group.start; index < group.start + group.count; index += 3) {
          a.fromBufferAttribute(positions, index).applyMatrix4(model.label.matrixWorld);
          b.fromBufferAttribute(positions, index + 1).applyMatrix4(model.label.matrixWorld);
          c.fromBufferAttribute(positions, index + 2).applyMatrix4(model.label.matrixWorld);
          normal.crossVectors(b.sub(a), c.sub(a)).normalize();
          if (normal.dot(view) <= 1e-7) continue;
          visible++;
          expect(group.materialIndex, `Rear panel exposed at progress ${progress}, triangle ${index / 3}`).not.toBe(1);
        }
        expect(visible).toBeGreaterThan(0);
      }
    } finally { model.dispose(); front.dispose(); back.dispose(); }
  });

  it('does not expand the final arm pixels across the side wall a second time', () => {
    for (const degrees of [-90, -85, -75, -60, 0, 60, 75, 85, 90]) {
      const angle = THREE.MathUtils.degToRad(degrees);
      expect(canPhotographAngle(angle)).toBeCloseTo(angle, 12);
    }
    const label = sampledLabel();
    try {
      // Unseen side pixels use independent background panels, not a compressed
      // continuation of the front character or a backwards reflection of it.
      for (const sign of [-1, 1]) {
        const near = label.at(sign * 90.01, 0, 2).x;
        const middle = label.at(sign * 120, 0, 2).x;
        const end = label.at(sign * 150, 0, 2).x;
        expect(middle).toBeGreaterThan(near);
        expect(end).toBeGreaterThan(middle);
        const start = sign < 0 ? 0 : .5;
        expect(near - start).toBeGreaterThanOrEqual(16 / 1024);
        expect(start + .5 - end).toBeGreaterThanOrEqual(16 / 1024);
        expect(near + end).toBeCloseTo(start * 2 + .5, 3);
      }
    } finally { label.dispose(); }
  });

  it('joins real front edge RGB to background-only side panels without repeating arm pixels', () => {
    const front = photograph(), back = new THREE.Texture();
    const width = 10, height = 16, data = new Uint8Array(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set([0, 80, 160, 255], i);
    const background = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    const model = createCanModel(back, '#00A7AB');
    try {
      applyCanReference(model, front, back, background);
      const sideMap = (model.label.material as THREE.MeshBasicMaterial[])[2].map as THREE.DataTexture;
      const pixels = sideMap.image.data as Uint8Array;
      const pixel = (x: number, y: number) => [...pixels.slice((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4)];
      // The first texel of each side exactly matches its own opaque photo edge.
      // Atlas texel centres follow the photograph's actual interpolated UVs.
      expect(pixel(0, 6)).toEqual([40, 82, 72, 255]);
      expect(pixel(512, 6)).toEqual([140, 82, 72, 255]);
      // Within five physical degrees there is only the approved empty background.
      for (const x of [64, 256, 511, 576, 768, 1023]) expect(pixel(x, 6)).toEqual([0, 80, 160, 255]);
      expect([...background.image.data as Uint8Array]).toEqual([...data]);
    } finally { model.dispose(); front.dispose(); back.dispose(); background.dispose(); }
  });

  it('continues both approved horizontal bands and excludes side bolts, lettering and the table', () => {
    const front = metalPhotograph(), width = 200, height = 1000;
    // The bright core is inset from a dark photographic silhouette, as in the
    // approved can. The side must continue that core rather than its dim edge.
    const frontData = front.image.data as Uint8Array;
    for (let y = 44; y <= 51; y++) for (const start of [66,182]) for (let x = start; x < start + 10; x++) frontData.set([220,255,255,254],(y * 256 + x) * 4);
    for (let y = 334; y <= 341; y++) for (const start of [40,208]) for (let x = start; x < start + 10; x++) frontData.set([220,255,255,254],(y * 256 + x) * 4);
    for (let y = 44; y <= 51; y++) for (const x of [68,186]) frontData.set([0,245,255,254],(y * 256 + x) * 4);
    for (let y = 334; y <= 341; y++) for (const x of [42,214]) frontData.set([0,245,255,254],(y * 256 + x) * 4);
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const band = y >= 48 && y <= 53 || y >= 947 && y <= 953;
      const table = x > 115 && y > 100 && y < 920;
      data.set(band ? x >= 150 ? [180,255,255,255] : [255,180,80,255] : table ? [255,255,255,255] : [0,50,100,255],(y * width + x) * 4);
    }
    const back = new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
    const sideData = new Uint8Array(width * height * 4);
    for (let offset = 0; offset < sideData.length; offset += 4) sideData.set([255,0,255,255],offset);
    const oldSides = new THREE.DataTexture(sideData,width,height,THREE.RGBAFormat);
    const model = createCanModel(back,'#00A7AB');
    const frontPixels = new Uint8Array(front.image.data as Uint8Array);
    try {
      applyCanReference(model,front,back,oldSides);
      const sideMap = (model.label.material as THREE.MeshBasicMaterial[])[2].map as THREE.DataTexture;
      const printedFront = (model.label.material as THREE.MeshBasicMaterial[])[0].map as THREE.DataTexture;
      const extended = printedFront.image.data as Uint8Array;
      expect(extended[(47 * 256 + 58) * 4]).toBeGreaterThan(180);
      for (const [x,y] of [[120,20],[128,200],[128,370]]) for (let channel = 0; channel < 3; channel++) {
        const offset = (y * 256 + x) * 4 + channel;
        expect(extended[offset]).toBe(frontPixels[offset]);
      }
      const pixels = sideMap.image.data as Uint8Array;
      const pixel = (x: number,y: number) => [...pixels.slice((y * 1024 + x) * 4,(y * 1024 + x) * 4 + 4)];
      const upper = Math.round(.05066 * 383), lower = Math.round(.9502 * 383);
      for (const x of [0,512]) for (const y of [upper,lower]) {
        // The seam continues the actual photograph, not an invented white core.
        // Its replicated gutter prevents the neighbouring panel bleeding in.
        for (let inset = 0; inset <= 16; inset++) expect(pixel(x + inset,y)).toEqual(pixel(x + 16,y));
        expect(pixel(x,y)[3]).toBe(255);
      }
      for (const x of [160,256,511,672,768,1023]) {
        const bandColour = x < 512 ? [180,255,255,255] : [255,180,80,255];
        expect(pixel(x,upper)).toEqual(bandColour);
        expect(pixel(x,lower)).toEqual(bandColour);
        for (const y of [80,150,230,300]) expect(pixel(x,y)).toEqual([0,50,100,255]);
      }
      const positions = model.label.geometry.getAttribute('position'), uv = model.label.geometry.getAttribute('uv');
      for (const group of model.label.geometry.groups) if (group.materialIndex === 2) {
        for (let i = group.start; i < group.start + group.count; i++) expect(uv.getY(i)).toBeCloseTo((positions.getY(i) + 1.7) / 3.42,6);
      }
      expect((front.image.data as Uint8Array).every((value,index) => value === frontPixels[index])).toBe(true);
      expect(back.image.data).toBe(data);
      expect(oldSides.image.data).toBe(sideData);
    } finally { model.dispose();front.dispose();back.dispose();oldSides.dispose(); }
  });

  it('calibrates model-local vertices independently of world placement and stays rigid in both yaw directions', () => {
    const front = photograph(), back = new THREE.Texture();
    const first = createCanModel(back, '#00A7AB'), second = createCanModel(back, '#00A7AB');
    const parent = new THREE.Group();
    parent.position.set(12, -9, 5); parent.rotation.set(.3, -.7, .5); parent.scale.setScalar(2.4);
    parent.add(second.group); second.group.position.set(-3, 2, 4); second.group.rotation.set(.2, .8, -.2);
    try {
      const a = applyCanReference(first, front, back), b = applyCanReference(second, front, back);
      for (const key of Object.keys(a.bounds) as (keyof typeof a.bounds)[]) expect(b.bounds[key]).toBeCloseTo(a.bounds[key], 5);
      const firstUv = first.label.geometry.getAttribute('uv'), secondUv = second.label.geometry.getAttribute('uv');
      for (let index = 0; index < firstUv.count; index++) {
        expect(secondUv.getX(index)).toBeCloseTo(firstUv.getX(index), 6); expect(secondUv.getY(index)).toBeCloseTo(firstUv.getY(index), 6);
      }
      const geometry = first.label.geometry, uv = firstUv.array.slice();
      const yawSize = (yaw: number) => {
        first.group.rotation.y = THREE.MathUtils.degToRad(yaw);
        return new THREE.Box3().setFromObject(first.group).getSize(new THREE.Vector3());
      };
      const left = yawSize(-26), right = yawSize(26);
      expect(left.x).toBeCloseTo(right.x, 6); expect(left.y).toBeCloseTo(right.y, 6); expect(left.z).toBeCloseTo(right.z, 6);
      expect(first.label.geometry).toBe(geometry); expect(firstUv.array).toEqual(uv);
    } finally { first.dispose(); second.dispose(); front.dispose(); back.dispose(); }
  });

  it('retains original label geometry and material when another mesh still uses them', () => {
    const front = photograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    const originalGeometry = model.label.geometry, originalMaterial = model.label.material as THREE.Material;
    const shared = new THREE.Mesh(originalGeometry, originalMaterial);
    model.group.add(shared);
    const uv = originalGeometry.getAttribute('uv');
    const geometryDispose = vi.spyOn(originalGeometry, 'dispose'), materialDispose = vi.spyOn(originalMaterial, 'dispose');
    try {
      applyCanReference(model, front, back);
      expect(shared.geometry).toBe(originalGeometry); expect(shared.geometry.getAttribute('uv')).toBe(uv);
      expect(shared.material).toBe(originalMaterial); expect(model.label.geometry).not.toBe(originalGeometry);
      expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
      model.dispose();
      expect(geometryDispose).toHaveBeenCalledTimes(1); expect(materialDispose).toHaveBeenCalledTimes(1);
    } finally { model.dispose(); front.dispose(); back.dispose(); }
  });

  it('releases replaced label and band resources once, retaining shared native metal and caller-owned images', () => {
    const front = photograph(), back = new THREE.Texture(), model = createCanModel(back, '#00A7AB');
    const sourceSpies = [vi.spyOn(front, 'dispose'), vi.spyOn(back, 'dispose')];
    const inkDispose = vi.spyOn(model.label.material as THREE.Material, 'dispose');
    const hardwareMaterials = new Set<THREE.Material>();
    model.group.traverse(object => {
      if (object instanceof THREE.Mesh && object !== model.label) for (const material of materials(object)) hardwareMaterials.add(material);
    });
    const hardwareSpies = new Map([...hardwareMaterials].map(material => [material, vi.spyOn(material, 'dispose')]));
    const oldBandGeometrySpies = [...photographedMetal].map(name => vi.spyOn((model.group.getObjectByName(name) as THREE.Mesh).geometry, 'dispose'));
    const geometryDispose = vi.spyOn(model.label.geometry, 'dispose');
    applyCanReference(model, front, back);
    expect(geometryDispose).toHaveBeenCalledTimes(1); expect(inkDispose).toHaveBeenCalledTimes(1);
    const retainedMaterials = new Set<THREE.Material>();
    model.group.traverse(object => {
      if (object instanceof THREE.Mesh) for (const material of materials(object)) retainedMaterials.add(material);
    });
    for (const [material, dispose] of hardwareSpies) expect(dispose).toHaveBeenCalledTimes(retainedMaterials.has(material) ? 0 : 1);
    for (const dispose of oldBandGeometrySpies) expect(dispose).toHaveBeenCalledTimes(1);
    const replacements = model.label.material as THREE.MeshBasicMaterial[];
    const bandMaterials = [...photographedMetal].map(name => (model.group.getObjectByName(name) as THREE.Mesh).material as THREE.MeshBasicMaterial);
    const lidMaterial = (model.group.getObjectByName('lid') as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const replacementSpies = [...replacements, ...bandMaterials, lidMaterial].map(material => vi.spyOn(material, 'dispose'));
    const derivedDispose = vi.spyOn(replacements[0].map!, 'dispose');
    const sideTextureDispose = vi.spyOn(replacements[2].map!, 'dispose');
    const lidTextureDispose = vi.spyOn(lidMaterial.map!, 'dispose');
    for (const material of bandMaterials) expect(material.map).toBe(replacements[0].map);
    model.dispose(); model.dispose();
    for (const dispose of [...hardwareSpies.values(), ...oldBandGeometrySpies, ...replacementSpies, derivedDispose, sideTextureDispose, lidTextureDispose, inkDispose, geometryDispose]) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of sourceSpies) expect(dispose).not.toHaveBeenCalled();
    front.dispose(); back.dispose();
  });
});
