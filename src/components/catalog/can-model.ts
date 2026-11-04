import * as THREE from 'three';

export const CAN_MODEL_DIMENSIONS = { height: 3.7, radius: .74, labelHeight: 3.42 } as const;

export interface CanModel {
  group: THREE.Group;
  label: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
  /** Disposes model geometry/materials only. The caller owns labelTexture. */
  dispose(): void;
}

/** Procedural can matching the approved tall 500 ml reference silhouette. */
export function createCanModel(labelTexture: THREE.Texture, accent: string): CanModel {
  const group = new THREE.Group();
  group.name = 'energy-can';
  const metal = new THREE.MeshStandardMaterial({ color: 0xd5dce1, metalness: .98, roughness: .24, envMapIntensity: 1.35 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x141a1f, metalness: .9, roughness: .34 });
  const rimMetal = new THREE.MeshStandardMaterial({ color: 0xb8c0c6, metalness: .98, roughness: .22, envMapIntensity: 1.3 });
  // The Hero neck is neutral near-black metal. Blue-tinted steel and room
  // reflections made this independent band look like a second coloured label.
  const collarMetal = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: .92, roughness: .45, envMapIntensity: 0 });
  const baseCutMetal = new THREE.MeshStandardMaterial({ color: 0x636d75, metalness: .9, roughness: .36, envMapIntensity: 1.0 });
  const grooveMetal = new THREE.MeshStandardMaterial({ color: 0x555c62, metalness: .9, roughness: .37 });
  const innerRimMetal = new THREE.MeshStandardMaterial({ color: 0x171d23, metalness: .92, roughness: .26, envMapIntensity: .8 });
  const lidMetal = new THREE.MeshStandardMaterial({ color: 0x717b83, metalness: .97, roughness: .28, envMapIntensity: 1.55 });
  const lidBevelMetal = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: .98, roughness: .22, envMapIntensity: 1.4 });
  // At the shallow Hero angle, a physical Fresnel reflection washes the face
  // grey. Keep its approved colour on the cap; the rounded edges stay lit metal.
  const tabMetal = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
  const tabEdgeMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent).multiplyScalar(.75), metalness: 1, roughness: .22, envMapIntensity: 1.3, toneMapped: false });
  const ink = new THREE.MeshStandardMaterial({ color: 0xffffff, map: labelTexture, roughness: .5, metalness: .08 });
  const ownedTextures = new Set<THREE.Texture>();

  // Tool marks alter the actual metal normal/roughness, without adding painted
  // highlights to either the hardware or the approved product illustration.
  function brushedFinish(name: string, circular: boolean) {
    const width = circular ? 512 : 256, height = 512;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const toolPath = circular ? Math.hypot(x - (width - 1) / 2, y - (height - 1) / 2) : y;
      const grain = ((x * 37 + y * 17) % 31 - 15) * .27;
      const value = 219 + Math.round(Math.sin(toolPath * 2.4) * 13 + Math.sin(toolPath * .71) * 7 + grain);
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.name = name;
    texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
    ownedTextures.add(texture);
    return texture;
  }
  const circularBrush = brushedFinish('circular-pressed-aluminium', true);
  lidMetal.bumpMap = circularBrush; lidMetal.bumpScale = .0035; lidMetal.roughnessMap = circularBrush;
  const sideBrush = brushedFinish('rolled-aluminium-grain', false);
  for (const material of [metal, rimMetal, collarMetal, baseCutMetal, lidBevelMetal]) {
    material.bumpMap = sideBrush; material.bumpScale = .0007; material.roughnessMap = sideBrush;
  }

  function add<G extends THREE.BufferGeometry>(name: string, geometry: G, material: THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // The rolled foot, straight wall, shoulder and neck are one smooth lathed shell.
  // Its wall sits just inside the printed cylinder to avoid depth flicker.
  const profile = [
    [.001, -1.86075], [.3134, -1.86075], [.3539, -1.88675],
    [.36865, -1.88575], [.4385, -1.87375], [.5585, -1.84],
    [.5885, -1.82], [.6125, -1.78], [.6345, -1.74], [.72, -1.70], [.738, -1.52],
    [.738, 1.52], [.728, 1.58], [.687, 1.65], [.602, 1.735],
    [.581, 1.78], [.581, 1.799],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  add('can-shell', new THREE.LatheGeometry(profile, 64), darkMetal);

  // A continuous printed surface follows the lower roll and upper shoulder.
  // u=.25 is z+ (the centre of the front/left half of the continuous label).
  const printedProfile = [
    [.719, -1.70], [.7236, -1.66], [.7259, -1.64], [.727, -1.63],
    [.7294, -1.61], [.7317, -1.59], [.7341, -1.57], [.7365, -1.55],
    [.7388, -1.53], [.74, -1.52], [.74, 1.48], [.74, 1.50], [.74, 1.52],
    [.7367, 1.54], [.7333, 1.56], [.730, 1.58], [.7183, 1.60],
    [.7066, 1.62], [.689, 1.65], [.620, 1.72],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  // 96 sectors place the 90° photo and 150° reverse boundaries on whole quads.
  const printedGeometry = new THREE.LatheGeometry(printedProfile, 96, -Math.PI / 2);
  const positions = printedGeometry.getAttribute('position');
  const uv = printedGeometry.getAttribute('uv');
  // LatheGeometry normally distributes v by profile index. Height-based v keeps
  // the approved artwork continuous, without repeating/stretching a top strip.
  for (let index = 0; index < positions.count; index++) {
    const phi = -Math.PI / 2 + uv.getX(index) * Math.PI * 2;
    // The approved reference has full-width front/back panels. Compensate for
    // the cylinder's foreshortening so their lettering remains readable front-on.
    uv.setX(index, phi <= Math.PI / 2 ? .25 + .25 * Math.sin(phi) : .75 - .25 * Math.sin(phi));
    uv.setY(index, (positions.getY(index) + 1.7) / 3.42);
  }
  const label = add('printed-label', printedGeometry, ink);
  label.userData.frontU = .25;

  function ring(name: string, radius: number, tube: number, height: number, material = rimMetal) {
    const mesh = add(name, new THREE.TorusGeometry(radius, tube, 10, 64), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = height;
    return mesh;
  }
  // The Hero's front lip is a visible silver wall, with a darker neck below.
  // Deepen the wall downward; its top and radius retain the calibrated framing.
  const rolledLip = [
    [.580, 1.771], [.598, 1.772], [.610, 1.777], [.617, 1.785],
    [.618, 1.810],
    [.613, 1.827], [.603, 1.834], [.595, 1.833], [.587, 1.825],
    [.584, 1.812], [.583, 1.789], [.582, 1.777], [.580, 1.771],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  add('top-rolled-rim', new THREE.LatheGeometry(rolledLip, 96), rimMetal);
  const neckCollar = [
    [.620, 1.720], [.612, 1.733], [.603, 1.746], [.590, 1.762], [.584, 1.777],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  add('top-metal-collar', new THREE.LatheGeometry(neckCollar, 96), collarMetal);
  const innerWall = [
    [.587, 1.823], [.583, 1.808], [.579, 1.789], [.579, 1.776],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  add('top-inner-wall', new THREE.LatheGeometry(innerWall, 96), innerRimMetal);
  ring('bottom-rolled-rim', .35, .012, -1.873);
  // Shallow circumferential cuts interrupt the Hero's brushed foot. These are
  // recessed profile steps all the way around, not a front-only painted stripe.
  const foot = [
    [.3134, -1.86075], [.3539, -1.88675], [.36865, -1.88575],
    [.4385, -1.87375], [.5585, -1.840], [.5885, -1.820],
    [.6125, -1.780], [.6136, -1.778], [.6108, -1.774], [.6180, -1.770],
    [.6290, -1.750], [.6268, -1.745], [.6366, -1.739],
    [.6773, -1.720], [.720, -1.700],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  const footGeometry = new THREE.LatheGeometry(foot, 96);
  // Group both cuts into one draw call without layering coplanar cylinders.
  const baseIndices: number[] = [], cutIndices: number[] = [];
  const footIndex = footGeometry.getIndex()!;
  for (let start = 0; start < footIndex.count; start += 3) {
    const profileSegment = Math.floor(start / 6) % (foot.length - 1);
    const indices = profileSegment === 8 || profileSegment === 11 ? cutIndices : baseIndices;
    indices.push(footIndex.getX(start), footIndex.getX(start + 1), footIndex.getX(start + 2));
  }
  footGeometry.setIndex([...baseIndices, ...cutIndices]);
  footGeometry.addGroup(0, baseIndices.length, 0);
  footGeometry.addGroup(baseIndices.length, cutIndices.length, 1);
  add('brushed-aluminium-foot', footGeometry, [metal, baseCutMetal]);

  // A perfectly flat disk reflects one environment direction in an orthographic
  // view. The gently pressed dish varies its normals like the Hero's real lid.
  const lidProfile = [
    [0, -.004], [.09, -.005], [.20, -.010], [.33, -.009], [.43, -.004],
    [.48, 0], [.508, 0], [.545, 0], [.580, 0],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  const lidGeometry = new THREE.LatheGeometry([...lidProfile].reverse(), 128);
  const lidPositions = lidGeometry.getAttribute('position'), lidUv = lidGeometry.getAttribute('uv');
  for (let index = 0; index < lidPositions.count; index++) {
    lidUv.setXY(index, .5 + lidPositions.getX(index) / 1.16, .5 + lidPositions.getZ(index) / 1.16);
  }
  const lid = add('lid', lidGeometry, lidMetal);
  lid.position.y = 1.776;
  const pressedBevel = [
    [.508, 1.777], [.517, 1.783], [.532, 1.783], [.539, 1.777],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  add('lid-pressed-bevel', new THREE.LatheGeometry(pressedBevel, 96), lidBevelMetal);
  ring('lid-pressed-groove', .544, .0028, 1.779, innerRimMetal);
  ring('lid-inner-groove', .503, .0022, 1.779, grooveMetal);

  // Closed scored opening: a shallow dark outline, rather than an open can.
  const opening = ring('lid-scored-opening', .174, .0032, 1.780, innerRimMetal);
  opening.position.z = .205;
  opening.scale.set(.86, 1.20, 1);
  const scorePositions = opening.geometry.getAttribute('position');
  for (let index = 0; index < scorePositions.count; index++) {
    const radius = Math.hypot(scorePositions.getX(index) * .86, .205 - scorePositions.getY(index) * 1.20);
    const segment = lidProfile.findIndex(point => point.x >= radius);
    const lower = lidProfile[Math.max(0, segment - 1)], upper = lidProfile[Math.max(0, segment)];
    const fraction = upper.x === lower.x ? 0 : (radius - lower.x) / (upper.x - lower.x);
    scorePositions.setZ(index, scorePositions.getZ(index) + THREE.MathUtils.lerp(lower.y, upper.y, fraction));
  }
  opening.geometry.computeVertexNormals();

  const tabShape = new THREE.Shape();
  // Broader rounded shoulders match the Hero's anodised loop. Inset the cap
  // outline and enlarge its paths by the same amount so the outer silhouette
  // and the actual through-holes keep their approved dimensions.
  tabShape.moveTo(-.142, -.18);
  tabShape.quadraticCurveTo(-.142, -.252, 0, -.252);
  tabShape.quadraticCurveTo(.142, -.252, .142, -.18);
  tabShape.lineTo(.151, .13);
  tabShape.quadraticCurveTo(.151, .277, 0, .277);
  tabShape.quadraticCurveTo(-.151, .277, -.151, .13);
  tabShape.lineTo(-.142, -.18);
  const tabHole = new THREE.Path();
  tabHole.absellipse(0, .11, .118, .123, 0, Math.PI * 2, true);
  tabShape.holes.push(tabHole);
  const rivetHole = new THREE.Path();
  rivetHole.absellipse(0, -.16, .070, .065, 0, Math.PI * 2, true);
  tabShape.holes.push(rivetHole);
  const tabGeometry = new THREE.ExtrudeGeometry(tabShape, {
    depth: .025, bevelEnabled: true, bevelSize: .022,
    bevelThickness: .010, bevelSegments: 5, curveSegments: 32,
  });
  // The rounder bevel occupies the existing 0.045 thickness and lid clearance.
  tabGeometry.translate(0, 0, .005);
  const tab = new THREE.Mesh(tabGeometry, [tabMetal, tabEdgeMetal]);
  tab.name = 'coloured-pull-tab'; tab.castShadow = true; tab.receiveShadow = true; group.add(tab);
  tab.rotation.x = -Math.PI / 2;
  tab.position.set(0, 1.792, .03);

  const rivet = add('pull-tab-rivet', new THREE.CylinderGeometry(.041, .045, .019, 32), metal);
  rivet.position.set(0, 1.829, .19);

  const bottom = add('bottom-inset', new THREE.CircleGeometry(.30, 64), metal);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -1.86075;

  let disposed = false;
  return {
    group,
    label,
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of ownedTextures) texture.dispose();
      group.clear();
    },
  };
}
