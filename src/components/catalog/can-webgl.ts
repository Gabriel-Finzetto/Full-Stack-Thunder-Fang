import * as THREE from 'three';
import generatedTextures from './can-textures.generated.json';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CAN_WOBBLE_PHASES, canTiltX, canTiltY, canTiltZ } from '@/domain/orbit';
import { createCanModel, type CanModel } from './can-model';
import { createCanTexture } from './can-texture';
import { applyCanReference, CAN_REFERENCE_ELEVATION } from './can-reference';

export interface CanStageController {
  setProgress(progress: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface CanStageOptions {
  canvas: HTMLCanvasElement;
  frames: HTMLElement[];
  products: readonly { slug: string; accent: string }[];
  onReady(): void;
  onFailure(): void;
}

type RuntimeTextureSet = { front: { url: string }; rear: { url: string }; sides: { url: string } };
const runtimeTextures: Record<string, RuntimeTextureSet> = generatedTextures.textures;

/** One transparent context for all four fixed slots; renders only on demand. */
export function createCanStage(options: CanStageOptions): CanStageController {
  const { canvas, frames, products } = options;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, stencil: false });
  } catch (error) {
    canvas.dataset.canFailure = 'webgl';
    throw error;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 50);
  const viewDirection = new THREE.Vector3(0, Math.sin(CAN_REFERENCE_ELEVATION), Math.cos(CAN_REFERENCE_ELEVATION));
  const viewUp = new THREE.Vector3(0, Math.cos(CAN_REFERENCE_ELEVATION), -Math.sin(CAN_REFERENCE_ELEVATION));
  // Only the physical lid, tab and foot receive light. The approved printed
  // artwork keeps its original colours through its unlit material.
  const ambient = new THREE.HemisphereLight(0xffffff, 0x222a31, .55);
  const key = new THREE.DirectionalLight(0xfffaf4, 2.2); key.position.set(-3.5, 5.5, 7);
  const fill = new THREE.DirectionalLight(0xeaf1fa, .65); fill.position.set(4, 2, 4);
  for (const light of [ambient, key, fill]) { light.layers.enableAll(); scene.add(light); }
  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget;
  try { environment = generator.fromScene(room, .04, .1, 100, { size: 128 }); }
  catch (error) { canvas.dataset.canFailure = 'environment'; renderer.dispose(); renderer.forceContextLoss(); throw error; }
  finally { room.dispose(); generator.dispose(); }
  scene.environment = environment.texture;
  scene.environmentIntensity = .8;

  const textures = new Set<THREE.Texture>();
  const models: CanModel[] = [];
  const referenceFrames: ReturnType<typeof applyCanReference>[] = [];
  let visible = false, disposed = false, loaded = false, notified = false, reconcileProgress = true;
  let progress = 0, targetProgress = 0, request = 0, needsMeasure = true, width = 0, height = 0, renderCount = 0, shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };
  let slots: { left: number; bottom: number; width: number; height: number }[] = [];

  function measure() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    slots = frames.map(frame => {
      const rect = frame.getBoundingClientRect();
      return { left: rect.left - bounds.left, bottom: bounds.bottom - rect.bottom, width: rect.width, height: rect.height };
    });
    if (width > 0 && height > 0) renderer.setSize(width, height, false);
    needsMeasure = false;
  }

  function render() {
    request = 0;
    if (disposed || !loaded || !visible || document.hidden) return;
    try {
    if (needsMeasure) measure();
    if (width <= 0 || height <= 0) return;
    // Slow graphics must still display both sides instead of jumping over the
    // left pose between two Spring updates. Follow the same orbit in small
    // rendered steps, and stop requesting frames as soon as it catches up.
    progress += Math.max(-.12, Math.min(.12, targetProgress - progress));
    if (Math.abs(targetProgress - progress) < 1e-8) progress = targetProgress;
    renderer.setScissorTest(false); renderer.clear();
    renderer.setScissorTest(true);
    let renderedSlots = 0;
    for (let index = 0; index < models.length; index++) {
      const model = models[index], slot = slots[index];
      if (!slot || slot.width <= 0 || slot.height <= 0) continue;
      const phase = CAN_WOBBLE_PHASES[index];
      model.group.rotation.set(
        THREE.MathUtils.degToRad(canTiltX(progress, phase)),
        THREE.MathUtils.degToRad(canTiltY(progress, phase)),
        THREE.MathUtils.degToRad(canTiltZ(progress, phase)),
      );
      camera.layers.set(index + 1);
      // Frame the same full PNG as the static hero, including its transparent
      // margins. Its photographed lid determines the viewing elevation.
      const reference = referenceFrames[index];
      const { bounds, imageBounds } = reference;
      const fullWidth = bounds.width * imageBounds.width / imageBounds.opaqueWidth;
      const fullHeight = bounds.height * imageBounds.height / imageBounds.opaqueHeight;
      const centerX = bounds.minX - bounds.width * imageBounds.left / imageBounds.opaqueWidth + fullWidth / 2;
      const centerY = bounds.maxY + bounds.height * imageBounds.top / imageBounds.opaqueHeight - fullHeight / 2;
      const aspect = slot.width / slot.height, imageAspect = imageBounds.width / imageBounds.height;
      const viewWidth = fullWidth * Math.max(1, aspect / imageAspect);
      const viewHeight = fullHeight * Math.max(1, imageAspect / aspect);
      camera.left = -viewWidth / 2; camera.right = viewWidth / 2;
      camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
      const target = viewUp.clone().multiplyScalar(centerY); target.x = centerX;
      camera.position.copy(target).addScaledVector(viewDirection, 13);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      renderer.setViewport(slot.left, slot.bottom, slot.width, slot.height);
      renderer.setScissor(slot.left, slot.bottom, slot.width, slot.height);
      renderer.render(scene, camera);
      renderedSlots++;
    }
    renderer.setScissorTest(false);
    if (shaderFailed || renderer.getContext().isContextLost()) { fail(shaderFailed ? 'shader' : 'context'); return; }
    if (renderedSlots !== models.length || !renderedSlots) return;
    canvas.dataset.canRenderedProgress = progress.toFixed(5);
    canvas.dataset.threeRenderCount = String(++renderCount);
    if (!notified) { notified = true; options.onReady(); }
    if (progress !== targetProgress) invalidate();
    } catch { fail('render'); }
  }

  function fail(reason: string) {
    if (disposed) return;
    canvas.dataset.canFailure = reason;
    options.onFailure();
    dispose();
  }

  function invalidate() {
    if (!disposed && loaded && visible && !document.hidden && !request) request = window.requestAnimationFrame(render);
  }
  const resize = new ResizeObserver(() => { needsMeasure = true; invalidate(); });
  resize.observe(canvas);
  for (const frame of frames) resize.observe(frame);
  const resized = () => { needsMeasure = true; invalidate(); };
  const documentVisibilityChanged = () => {
    if (!document.hidden) { progress = targetProgress; reconcileProgress = true; invalidate(); }
  };
  window.addEventListener('resize', resized);
  document.addEventListener('visibilitychange', documentVisibilityChanged);
  const contextLost = (event: Event) => { event.preventDefault(); fail('context'); };
  canvas.addEventListener('webglcontextlost', contextLost);

  function dispose() {
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame(request);
    resize.disconnect();
    window.removeEventListener('resize', resized);
    document.removeEventListener('visibilitychange', documentVisibilityChanged);
    canvas.removeEventListener('webglcontextlost', contextLost);
    for (const model of models) model.dispose();
    for (const texture of textures) texture.dispose();
    environment.dispose();
    scene.clear();
    renderer.dispose(); renderer.forceContextLoss();
  }

  const loader = new THREE.TextureLoader();
  const loading = products.map(product => {
    const assets = runtimeTextures[product.slug];
    if (!assets) return Promise.reject(new Error('Can artwork unavailable'));
    return Promise.all([assets.rear.url, assets.front.url, assets.sides.url].map(url => new Promise<THREE.Texture>((resolve, reject) => {
    const texture = loader.load(url, loadedTexture => {
      if (disposed) loadedTexture.dispose();
      resolve(loadedTexture);
    }, undefined, reject);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.add(texture);
    })));
  });
  void Promise.allSettled(loading).then(async results => {
    if (disposed) return;
    if (results.some(result => result.status === 'rejected')) throw new Error('Can label unavailable');
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status !== 'fulfilled') continue;
      const [labelSource, frontSource, sideSource] = result.value;
      const texture = createCanTexture(frontSource.image as HTMLImageElement, labelSource.image as HTMLImageElement,
        Math.min(8, renderer.capabilities.getMaxAnisotropy()), true);
      textures.add(texture);
      const model = createCanModel(texture, products[index].accent);
      referenceFrames.push(applyCanReference(model, frontSource, texture, sideSource));
      labelSource.dispose(); textures.delete(labelSource);
      frontSource.dispose(); textures.delete(frontSource);
      sideSource.dispose(); textures.delete(sideSource);
      model.group.traverse(object => object.layers.set(index + 1));
      models.push(model); scene.add(model.group);
      // Give pointer/keyboard/scroll work a turn between the four image scans.
      // There is no additional clock once the scene is ready.
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      if (disposed) return;
    }
    camera.layers.enableAll();
    await renderer.compileAsync(scene, camera);
    if (disposed) return;
    loaded = true; invalidate();
  }).catch(() => { fail('assets'); });

  return {
    setProgress(value) {
      targetProgress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      if (reconcileProgress) { progress = targetProgress; if (notified) reconcileProgress = false; }
      invalidate();
    },
    setVisible(value) {
      if (value && !visible) { progress = targetProgress; reconcileProgress = true; }
      visible = value;
      if (visible) { needsMeasure = true; invalidate(); } else { window.cancelAnimationFrame(request); request = 0; }
    },
    dispose,
  };
}
