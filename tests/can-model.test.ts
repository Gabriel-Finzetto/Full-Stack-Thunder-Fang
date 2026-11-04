import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCanModel } from '../src/components/catalog/can-model';

describe('lata tridimensional com a arte aprovada', () => {
  it('mantém o pescoço metálico neutro e sem reflexo azul em todos os sabores', () => {
    for (const accent of ['#00A7AB', '#ABA600', '#AB7800', '#A400AB']) {
      const texture = new THREE.Texture();
      const model = createCanModel(texture, accent);
      try {
        const collar = model.group.getObjectByName('top-metal-collar') as THREE.Mesh<THREE.LatheGeometry, THREE.MeshStandardMaterial>;
        const { color } = collar.material;
        expect(collar.material).toBeInstanceOf(THREE.MeshStandardMaterial);
        expect(color.r).toBeCloseTo(color.g, 10); expect(color.g).toBeCloseTo(color.b, 10);
        expect(Math.max(color.r, color.g, color.b)).toBeLessThan(.02);
        expect(collar.material.envMapIntensity).toBe(0);
        expect(collar.material.roughness).toBeGreaterThanOrEqual(.4);
        expect(collar.material.transparent).toBe(false);
        expect(collar.geometry.parameters.points.map(point => [point.x, point.y])).toEqual([
          [.620, 1.720], [.612, 1.733], [.603, 1.746], [.590, 1.762], [.584, 1.777],
        ]);
        const tab = model.group.getObjectByName('coloured-pull-tab') as THREE.Mesh;
        const cap = (tab.material as THREE.Material[])[0] as THREE.MeshBasicMaterial;
        expect(cap.color.getHexString()).toBe(accent.slice(1).toLowerCase());
        const surface = model.label.geometry as THREE.LatheGeometry;
        expect(surface.parameters.segments % 12).toBe(0);
      } finally { model.dispose(); texture.dispose(); }
    }
  });

  it('preserva a proporção visual de aproximadamente 2,5:1 e tem volume cilíndrico real', () => {
    const texture = new THREE.Texture();
    const model = createCanModel(texture, '#00A7AB');
    try {
      const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
      expect(size.y / size.x).toBeCloseTo(2.5, 1);
      expect(size.z / size.x).toBeCloseTo(1, 2);
      expect(size.x).toBeGreaterThan(1.4);
      const labelSize = new THREE.Box3().setFromObject(model.label).getSize(new THREE.Vector3());
      expect(labelSize.z).toBeGreaterThan(1.4);
      expect(labelSize.x).toBeCloseTo(labelSize.z, 3);
    } finally { model.dispose(); texture.dispose(); }
  });

  it('mantém a textura original e apresenta a frente e o verso corretos, sem espelhar o lettering', () => {
    const texture = new THREE.Texture();
    const model = createCanModel(texture, '#00A7AB');
    try {
      const material = model.label.material as THREE.MeshStandardMaterial;
      expect(material.map).toBe(texture);
      expect(material.color.getHex()).toBe(0xffffff);
      model.group.updateMatrixWorld(true);
      const sample = (x: number, z: number, directionZ: number) => {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 0, z), new THREE.Vector3(0, 0, directionZ));
        const hit = ray.intersectObject(model.label)[0];
        expect(hit?.uv).toBeDefined();
        return hit.uv!;
      };
      // The supplied continuous image places the front in its left half and
      // the nutrition panel in its right half. The front is viewed from z+.
      expect(sample(0, 3, -1).x).toBeCloseTo(.25, 5);
      expect(sample(0, -3, 1).x).toBeCloseTo(.75, 5);
      expect(sample(-.3, 3, -1).x).toBeLessThan(sample(.3, 3, -1).x);
      expect(sample(0, 3, -1).y).toBeGreaterThan(.45);
      expect(sample(0, 3, -1).y).toBeLessThan(.55);
    } finally { model.dispose(); texture.dispose(); }
  });

  it('distribui a altura do rótulo continuamente pelo corpo e pelos ombros', () => {
    const texture = new THREE.Texture();
    const model = createCanModel(texture, '#00A7AB');
    try {
      const positions = model.label.geometry.getAttribute('position');
      const uv = model.label.geometry.getAttribute('uv');
      const meridian = Array.from({ length: positions.count }, (_, index) => ({ y: positions.getY(index), u: uv.getX(index), v: uv.getY(index) }))
        .filter(point => Math.abs(point.u - .25) < 1e-6).sort((a, b) => a.y - b.y);
      expect(meridian.length).toBeGreaterThan(4);
      expect(meridian[0].v).toBeCloseTo(0, 5);
      expect(meridian.at(-1)!.v).toBeCloseTo(1, 5);
      const physicalHeight = meridian.at(-1)!.y - meridian[0].y;
      const shoulder = meridian.filter(point => point.y > 1.52);
      expect(shoulder.length).toBeGreaterThan(1);
      for (let index = 1; index < meridian.length; index++) {
        const before = meridian[index - 1], after = meridian[index];
        expect(after.v).toBeGreaterThan(before.v);
        expect((after.y - before.y) / (after.v - before.v)).toBeCloseTo(physicalHeight, 3);
      }
    } finally { model.dispose(); texture.dispose(); }
  });

  it('mantém a tampa rebaixada, a borda proporcional e o anel elevado com uma abertura real', () => {
    const texture = new THREE.Texture();
    const model = createCanModel(texture, '#00A7AB');
    try {
      model.group.updateMatrixWorld(true);
      const rim = model.group.getObjectByName('top-rolled-rim') as THREE.Mesh;
      const lid = model.group.getObjectByName('lid') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
      const tab = model.group.getObjectByName('coloured-pull-tab') as THREE.Mesh;
      const rimBounds = new THREE.Box3().setFromObject(rim);
      const tabBounds = new THREE.Box3().setFromObject(tab);
      const bodyWidth = new THREE.Box3().setFromObject(model.label).getSize(new THREE.Vector3()).x;
      const rimWidth = rimBounds.getSize(new THREE.Vector3()).x;
      const rimHeight = rimBounds.getSize(new THREE.Vector3()).y;
      expect(rimWidth / bodyWidth).toBeGreaterThan(.80);
      expect(rimWidth / bodyWidth).toBeLessThan(.86);
      // The Hero has a visible front silver wall, above a separate dark neck.
      expect(rimHeight / bodyWidth).toBeLessThan(.045);
      expect(rimHeight / bodyWidth).toBeGreaterThan(.04);
      const collar = model.group.getObjectByName('top-metal-collar') as THREE.Mesh;
      const collarBounds = new THREE.Box3().setFromObject(collar);
      expect(collarBounds.min.y).toBeCloseTo(1.720, 5);
      expect(collarBounds.max.y).toBeGreaterThan(rimBounds.min.y);
      expect((collar.material as THREE.MeshStandardMaterial).metalness).toBeGreaterThan(.9);
      expect(rimBounds.max.y - lid.position.y).toBeGreaterThan(.05);
      expect(rimBounds.max.y - lid.position.y).toBeLessThan(.07);
      expect(tabBounds.min.y - lid.position.y).toBeGreaterThan(.008);
      expect(tabBounds.getSize(new THREE.Vector3()).y).toBeGreaterThan(.04);
      expect(tabBounds.max.y).toBeLessThan(rimBounds.max.y);
      const throughFingerHole = new THREE.Raycaster(new THREE.Vector3(0, 3, -.08), new THREE.Vector3(0, -1, 0));
      const ontoTabEdge = new THREE.Raycaster(new THREE.Vector3(.14, 3, -.08), new THREE.Vector3(0, -1, 0));
      expect(throughFingerHole.intersectObject(tab)).toHaveLength(0);
      const ringHit = ontoTabEdge.intersectObject(tab)[0];
      expect(ringHit).toBeDefined();
      expect(ringHit.point.y - lid.position.y).toBeGreaterThan(.04);
    } finally { model.dispose(); texture.dispose(); }
  });

  it('reproduz os dois cortes da base em volume e mantém o mesmo perfil nos dois sentidos do giro', () => {
    const texture = new THREE.Texture();
    const model = createCanModel(texture, '#00A7AB');
    const foot = model.group.getObjectByName('brushed-aluminium-foot') as THREE.Mesh;
    const footMaterials = foot.material as THREE.MeshStandardMaterial[];
    try {
      expect(footMaterials).toHaveLength(2);
      for (const material of footMaterials) {
        expect(material.map).toBeNull(); expect(material.metalness).toBeGreaterThan(.8);
        expect(material.transparent).toBe(false); expect(material.alphaTest).toBe(0);
      }
      expect(foot.geometry.groups).toHaveLength(2);
      const radiusAt = (y: number) => {
        const ray = new THREE.Raycaster(new THREE.Vector3(0, y, 3), new THREE.Vector3(0, 0, -1));
        const hit = ray.intersectObject(foot)[0];
        expect(hit).toBeDefined();
        return hit.point.z;
      };
      const profiles: number[][] = [];
      for (const yaw of [-26, 0, 26]) {
        model.group.rotation.y = THREE.MathUtils.degToRad(yaw);
        model.group.updateMatrixWorld(true);
        const radii = [-1.778, -1.774, -1.770, -1.750, -1.745, -1.739].map(radiusAt);
        expect(radii[1]).toBeLessThan(Math.min(radii[0], radii[2]) - .002);
        expect(radii[4]).toBeLessThan(Math.min(radii[3], radii[5]) - .002);
        profiles.push(radii);
      }
      for (let index = 0; index < profiles[0].length; index++) {
        expect(profiles[0][index]).toBeCloseTo(profiles[2][index], 6);
        expect(profiles[0][index]).toBeCloseTo(profiles[1][index], 3);
      }
    } finally { model.dispose(); texture.dispose(); }
  });

  it('preserva os limites da silhueta usados para alinhar a lata com a fotografia Hero', () => {
    const texture = new THREE.Texture();
    const model = createCanModel(texture, '#00A7AB');
    try {
      model.group.updateMatrixWorld(true);
      const point = new THREE.Vector3(), elevation = 8 * Math.PI / 180;
      let minY = Infinity, maxY = -Infinity;
      model.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) {
          point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
          const projectedY = point.y * Math.cos(elevation) - point.z * Math.sin(elevation);
          minY = Math.min(minY, projectedY); maxY = Math.max(maxY, projectedY);
        }
      });
      expect(minY).toBeCloseTo(-1.91870080, 4);
      expect(maxY).toBeCloseTo(1.90007301, 7);
      const bounds = new THREE.Box3().setFromObject(model.group);
      expect(bounds.min.y).toBeGreaterThan(-1.89);
      expect(bounds.min.y).toBeLessThan(-1.88);
      expect(bounds.max.y).toBeCloseTo(1.8385, 5);
      expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(1.48, 5);
    } finally { model.dispose(); texture.dispose(); }
  });

  it('afina a silhueta inferior nas mesmas proporções medidas na referência Hero', () => {
    const texture = new THREE.Texture(), model = createCanModel(texture, '#00A7AB');
    try {
      const elevation = 8 * Math.PI / 180, cosine = Math.cos(elevation), sine = Math.sin(elevation);
      model.group.updateMatrixWorld(true);
      const triangles: { x: number; y: number }[][] = [];
      let minY = Infinity, maxY = -Infinity;
      model.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = object.geometry, positions = geometry.getAttribute('position'), indices = geometry.index;
        const projected = Array.from({ length: positions.count }, (_, index) => {
          const p = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
          const y = p.y * cosine - p.z * sine;
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          return { x: p.x, y };
        });
        for (let index = 0; index < (indices?.count ?? positions.count); index += 3) {
          triangles.push([0, 1, 2].map(offset => projected[indices ? indices.getX(index + offset) : index + offset]));
        }
      });
      for (const [row, pixels] of [[1480, 491], [1500, 452], [1520, 326]]) {
        const y = maxY - (row - 46) / 1488 * (maxY - minY);
        let left = Infinity, right = -Infinity;
        for (const triangle of triangles) for (let edge = 0; edge < 3; edge++) {
          const a = triangle[edge], b = triangle[(edge + 1) % 3];
          if (Math.abs(a.y - b.y) < 1e-8 || y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) continue;
          const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
          left = Math.min(left, x); right = Math.max(right, x);
        }
        expect(Math.abs((right - left) / 1.48 - pixels / 601)).toBeLessThan(.02);
      }
    } finally { model.dispose(); texture.dispose(); }
  });

  it('libera recursos compartilhados uma única vez, preservando a textura que pertence ao chamador', () => {
    const texture = new THREE.Texture();
    const textureDispose = vi.spyOn(texture, 'dispose');
    const model = createCanModel(texture, '#00A7AB');
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const metalTextures = new Set<THREE.Texture>();
    let materialReferences = 0;
    model.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const used = Array.isArray(object.material) ? object.material : [object.material];
      materialReferences += used.length;
      for (const material of used) {
        materials.add(material);
        if (material instanceof THREE.MeshStandardMaterial && material.bumpMap) metalTextures.add(material.bumpMap);
      }
    });
    expect(materialReferences).toBeGreaterThan(materials.size);
    const spies = [...geometries, ...materials, ...metalTextures].map(resource => vi.spyOn(resource, 'dispose'));
    model.dispose(); model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(textureDispose).not.toHaveBeenCalled();
    expect(model.group.children).toHaveLength(0);
    texture.dispose();
  });
});
