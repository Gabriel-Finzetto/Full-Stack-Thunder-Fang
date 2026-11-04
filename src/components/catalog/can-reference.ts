import * as THREE from 'three';
import { createLightningMask } from './can-lightning-mask';

/** The neutral photograph and the product camera share this shallow top view. */
export const CAN_REFERENCE_ELEVATION = 8 * Math.PI / 180;
/** Rear information begins behind every side exposed by the approved wobble. */
export const CAN_REFERENCE_FRONT_ARC = 5 * Math.PI / 6;

/** The photograph is already cylindrically wrapped: do not stretch it again. */
export function canPhotographAngle(angle: number) {
  return THREE.MathUtils.clamp(angle, -Math.PI / 2, Math.PI / 2);
}

interface CanReferenceModel {
  group: THREE.Group;
  label: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
}

export interface CanReferenceFrame {
  /** Model-local coordinates as seen by the neutral orthographic camera. */
  bounds: {
    minX: number; maxX: number; minY: number; maxY: number;
    width: number; height: number; centerX: number; centerY: number;
  };
  /** Opaque pixel bounds; right and bottom are exclusive. */
  imageBounds: {
    width: number; height: number;
    left: number; top: number; right: number; bottom: number;
    opaqueWidth: number; opaqueHeight: number;
  };
}

interface PhotographSeamPoint { height: number; u: number; v: number }
type PhotographSeams = readonly [readonly PhotographSeamPoint[], readonly PhotographSeamPoint[]];
const SIDE_PANEL_WIDTH = 512;
const SIDE_GUTTER = 16;
const linearSrgb = Float64Array.from({length: 256}, (_, byte) => {
  const value = byte / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
});
const encodeSrgb = (value: number) => 255 * (value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055);

/** Shared by the printed wall and its two exact photographic seam meridians. */
function projectPhotograph(point: THREE.Vector3, projection: CanReferenceFrame['bounds'], image: CanReferenceFrame['imageBounds'], rowLeft: Int32Array, rowRight: Int32Array, flipY: boolean, result: THREE.Vector2) {
  const angle = canPhotographAngle(Math.atan2(point.x, point.z));
  const projectedX = Math.hypot(point.x, point.z) * Math.sin(angle);
  const imageY = image.top + (projection.maxY - (point.y * Math.cos(CAN_REFERENCE_ELEVATION) - point.z * Math.sin(CAN_REFERENCE_ELEVATION))) / projection.height * image.opaqueHeight;
  let imageX = image.left + (projectedX - projection.minX) / projection.width * image.opaqueWidth;
  const shoulder = THREE.MathUtils.smoothstep(point.y, 1.48, 1.52);
  if (shoulder > 0) {
    const row = Math.max(0, Math.min(image.height - 1, Math.round(imageY)));
    if (rowLeft[row] >= 0) {
      const center = (rowLeft[row] + rowRight[row] + 1) / 2;
      const half = Math.max(.5, (rowRight[row] - rowLeft[row]) / 2 - 1);
      imageX = THREE.MathUtils.lerp(imageX, center + Math.sin(angle) * half, shoulder);
    }
  }
  return result.set(imageX / image.width, flipY ? 1 - imageY / image.height : imageY / image.height);
}

function samplePhotograph(texture: THREE.Texture) {
  const image = texture.image as {
    width?: number; height?: number; naturalWidth?: number; naturalHeight?: number;
    data?: ArrayLike<number>;
  } | undefined;
  const width = image?.naturalWidth || image?.width || 0;
  const height = image?.naturalHeight || image?.height || 0;
  if (!width || !height) throw new Error('The approved can photograph has not loaded.');

  let pixels: ArrayLike<number>;
  if (image?.data && image.data.length >= width * height * 4) {
    pixels = image.data;
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The approved can photograph could not be sampled.');
    context.drawImage(texture.image as CanvasImageSource, 0, 0, width, height);
    pixels = context.getImageData(0, 0, width, height).data;
  }

  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] <= 128) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  if (right <= left || bottom <= top) throw new Error('The approved can photograph has no opaque can.');
  return {
    pixels,
    bounds: { width, height, left, top, right, bottom, opaqueWidth: right - left, opaqueHeight: bottom - top },
  };
}

/**
 * Extend the photograph's edge colours rather than its transparent silhouette.
 * A photograph's alpha describes the neutral view, not holes in a rotating can.
 * The opaque copy keeps those pixels from cutting the shoulder and lower roll.
 */
function createOpaquePhotograph(
  source: THREE.Texture,
  pixels: ArrayLike<number>,
  { width, height }: CanReferenceFrame['imageBounds'],
) {
  const data = new Uint8Array(width * height * 4);
  const rowLeft = new Int32Array(height).fill(-1), rowRight = new Int32Array(height).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] <= 128) continue;
    if (rowLeft[y] === -1) rowLeft[y] = x;
    rowRight[y] = x;
  }
  const populatedRows: number[] = [];
  for (let y = 0; y < height; y++) if (rowLeft[y] !== -1) populatedRows.push(y);
  let nearestRow = 0;
  for (let y = 0; y < height; y++) {
    while (nearestRow + 1 < populatedRows.length
      && Math.abs(populatedRows[nearestRow + 1] - y) < Math.abs(populatedRows[nearestRow] - y)) nearestRow++;
    const sourceY = rowLeft[y] !== -1 ? y : populatedRows[nearestRow];
    const left = rowLeft[sourceY], right = rowRight[sourceY];
    let previousOpaque = left;
    for (let x = 0; x < width; x++) {
      const clampedX = Math.max(left, Math.min(right, x));
      if (pixels[(sourceY * width + clampedX) * 4 + 3] > 128) previousOpaque = clampedX;
      const sourceOffset = (sourceY * width + previousOpaque) * 4, targetOffset = (y * width + x) * 4;
      data[targetOffset] = pixels[sourceOffset];
      data[targetOffset + 1] = pixels[sourceOffset + 1];
      data[targetOffset + 2] = pixels[sourceOffset + 2];
      data[targetOffset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = 'opaque-approved-can-body';
  texture.colorSpace = source.colorSpace;
  texture.flipY = source.flipY;
  texture.anisotropy = source.anisotropy;
  texture.magFilter = source.magFilter;
  texture.minFilter = source.minFilter;
  texture.generateMipmaps = source.generateMipmaps;
  texture.needsUpdate = true;
  return { texture, rowLeft, rowRight };
}

/**
 * Continue the approved label's two circumferential lightning bands, with its
 * clean colour gutter between them. Do not repeat the old vertical side bolts
 * or spread the photographed arm over a second cylinder sector.
 */
function createSideContinuation(
  front: THREE.DataTexture,
  side: THREE.Texture,
  reverse: THREE.Texture,
  bounds: CanReferenceFrame['imageBounds'],
  projection: CanReferenceFrame['bounds'],
  rowLeft: Int32Array,
  rowRight: Int32Array,
  seams: PhotographSeams,
) {
  const reverseImage = reverse.image as { width?: number; naturalWidth?: number } | undefined;
  const hasReverse = Boolean(reverseImage?.naturalWidth || reverseImage?.width);
  const { pixels: background, bounds: sideBounds } = samplePhotograph(hasReverse ? reverse : side);
  const panelWidth = SIDE_PANEL_WIDTH, width = panelWidth * 2, height = bounds.height;
  const data = new Uint8Array(width * height * 4), frontPixels = front.image.data as Uint8Array;
  const reverseLeft = hasReverse ? sideBounds.width / 2 : 0;
  const reverseWidth = hasReverse ? sideBounds.width / 2 : sideBounds.width;
  const lightning = hasReverse ? createLightningMask(background,sideBounds.width,sideBounds.height,reverseLeft,reverseWidth) : null;
  if (hasReverse) {
    // The original neutral photograph compresses its final degrees into a dim
    // antialiased outline. Once that wall turns toward the viewer, extend only
    // the actual nearby lightning through those few printed-edge pixels.
    // This closes the visible gap before the separate side surface begins.
    const original = new Uint8Array(frontPixels);
    const glow = createLightningMask(original,bounds.width,height,0,bounds.width,{upper:.22,lower:.8});
    for (let y = 0; y < height; y++) {
      const physicalY = (projection.maxY - (y - bounds.top) / bounds.opaqueHeight * projection.height) / Math.cos(CAN_REFERENCE_ELEVATION);
      const fraction = (1.72 - physicalY) / 3.42;
      if (!(fraction > .01 && fraction < .12 || fraction > .87 && fraction < .99) || rowLeft[y] < 0) continue;
      const bandBlend = fraction < .5
        ? THREE.MathUtils.smoothstep(fraction,.01,.025) * (1 - THREE.MathUtils.smoothstep(fraction,.095,.12))
        : THREE.MathUtils.smoothstep(fraction,.87,.9) * (1 - THREE.MathUtils.smoothstep(fraction,.97,.99));
      for (let panel = 0; panel < 2; panel++) for (let inset = 0; inset < 18; inset++) {
        const sign = panel === 0 ? 1 : -1, edgeX = panel === 0 ? rowLeft[y] : rowRight[y];
        const x = Math.max(0,Math.min(bounds.width - 1,edgeX + sign * inset));
        const sourceX = Math.max(0,Math.min(bounds.width - 1,edgeX + sign * Math.round(12 + 8 * Math.sin(inset * Math.PI / 18))));
        const mask = Math.max(glow[y * bounds.width + x],glow[y * bounds.width + sourceX])
          * (1 - THREE.MathUtils.smoothstep(inset,8,18)) * bandBlend;
        const from = (y * bounds.width + sourceX) * 4, to = (y * bounds.width + x) * 4;
        for (let channel = 0; channel < 3; channel++) frontPixels[to + channel] = Math.round(THREE.MathUtils.lerp(original[to + channel],original[from + channel],mask));
      }
    }
    front.needsUpdate = true;
  }
  // The atlas contains the reverse in its right half. This narrow gutter is
  // outside the type/table panels in every approved flavour (x720 in1374px).
  const gutterX = Math.round(reverseLeft + reverseWidth * (33 / 687));
  const sample = (x: number, y: number, channel: number) => {
    const px = Math.max(0,Math.min(sideBounds.width - 1,x)), py = Math.max(0,Math.min(sideBounds.height - 1,y));
    const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(sideBounds.width - 1,x0 + 1), y1 = Math.min(sideBounds.height - 1,y0 + 1);
    const upper = THREE.MathUtils.lerp(background[(y0 * sideBounds.width + x0) * 4 + channel],background[(y0 * sideBounds.width + x1) * 4 + channel],px - x0);
    const lower = THREE.MathUtils.lerp(background[(y1 * sideBounds.width + x0) * 4 + channel],background[(y1 * sideBounds.width + x1) * 4 + channel],px - x0);
    return THREE.MathUtils.lerp(upper,lower,py - y0);
  };
  const maskAt = (x: number,y: number) => {
    if (!lightning) return 0;
    const px = Math.max(0,Math.min(reverseWidth - 1,x)), py = Math.max(0,Math.min(sideBounds.height - 1,y));
    const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(reverseWidth - 1,x0 + 1), y1 = Math.min(sideBounds.height - 1,y0 + 1);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(lightning[y0 * reverseWidth + x0],lightning[y0 * reverseWidth + x1],px - x0),
      THREE.MathUtils.lerp(lightning[y1 * reverseWidth + x0],lightning[y1 * reverseWidth + x1],px - x0),py - y0);
  };
  const photoRow = (fraction: number) => Math.max(0,Math.min(height - 1,Math.round(bounds.top
    + (projection.maxY - (1.72 - fraction * 3.42) * Math.cos(CAN_REFERENCE_ELEVATION)) / projection.height * bounds.opaqueHeight)));
  const frontCentre = (panel: number,centre: number) => {
    let total = 0,weighted = 0;
    const from = Math.max(0,Math.floor((centre - .04) * (height - 1))), to = Math.min(height - 1,Math.ceil((centre + .04) * (height - 1)));
    for (let y = from; y <= to; y++) {
      const row = photoRow(y / (height - 1));
      const edge = panel === 0 ? rowLeft[row] : rowRight[row];
      if (edge < 0) continue;
      for (let inset = 2; inset <= 12; inset += 2) {
        const x = Math.max(0,Math.min(bounds.width - 1,edge + (panel === 0 ? inset : -inset)));
        const offset = (row * bounds.width + x) * 4;
        const r = frontPixels[offset],g = frontPixels[offset + 1],b = frontPixels[offset + 2];
        const high = Math.max(r,g,b),low = Math.min(r,g,b),middle = r + g + b - high - low;
        if (high < 225 || middle < 170) continue;
        const weight = (middle - 150) ** 2;
        total += weight;weighted += weight * y / (height - 1);
      }
    }
    return total ? weighted / total : centre;
  };
  const rearCentre = (panel: number,centre: number) => {
    let total = 0,weighted = 0;
    const from = Math.max(0,Math.floor((centre - .04) * (sideBounds.height - 1))),to = Math.min(sideBounds.height - 1,Math.ceil((centre + .04) * (sideBounds.height - 1)));
    for (let y = from; y <= to; y++) for (let inset = 0; inset < 20; inset += 2) {
      const x = panel === 0 ? reverseWidth - 1 - inset : inset;
      const r = sample(reverseLeft + x,y,0),g = sample(reverseLeft + x,y,1),b = sample(reverseLeft + x,y,2);
      const middle = r + g + b - Math.max(r,g,b) - Math.min(r,g,b);
      const weight = maskAt(x,y) * Math.max(0,middle - 150) ** 2;
      total += weight;weighted += weight * y / (sideBounds.height - 1);
    }
    return total ? weighted / total : centre;
  };
  const alignment = [0,1].map(panel => [.05066,.9502].map(centre => hasReverse
    ? THREE.MathUtils.clamp(rearCentre(panel,centre) - frontCentre(panel,centre),-.04,.04) : 0));
  const sampleSeam = (panel: number, physicalY: number) => {
    const points = seams[panel];
    if (!points.length) return null;
    let segment = 0;
    while (segment < points.length - 2 && physicalY > points[segment + 1].height) segment++;
    const lower = points[segment], upper = points[Math.min(segment + 1, points.length - 1)];
    const blend = upper.height === lower.height ? 0 : THREE.MathUtils.clamp((physicalY - lower.height) / (upper.height - lower.height), 0, 1);
    const u = THREE.MathUtils.lerp(lower.u, upper.u, blend), v = THREE.MathUtils.lerp(lower.v, upper.v, blend);
    // GPU sampling uses texel centres. Interpolate the same per-profile UVs as
    // the photograph, including its shoulder taper, before reading its RGB.
    const x = THREE.MathUtils.clamp(u * bounds.width - .5, 0, bounds.width - 1);
    const y = THREE.MathUtils.clamp((front.flipY ? 1 - v : v) * height - .5, 0, height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, bounds.width - 1), y1 = Math.min(y0 + 1, height - 1);
    const srgb = front.colorSpace === THREE.SRGBColorSpace;
    return [0,1,2].map(channel => {
      const read = (px: number, py: number) => {
        const byte = frontPixels[(py * bounds.width + px) * 4 + channel];
        return srgb ? linearSrgb[byte] : byte;
      };
      const value = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(read(x0,y0), read(x1,y0), x - x0),
        THREE.MathUtils.lerp(read(x0,y1), read(x1,y1), x - x0), y - y0,
      );
      return srgb ? encodeSrgb(value) : value;
    });
  };
  for (let y = 0; y < height; y++) {
    const fraction = (y + .5) / height;
    const photoY = photoRow(fraction);
    const left = rowLeft[photoY] >= 0 ? rowLeft[photoY] : bounds.left;
    const right = rowRight[photoY] >= 0 ? rowRight[photoY] : bounds.right - 1;
    const seamColours = [sampleSeam(0, 1.72 - fraction * 3.42), sampleSeam(1, 1.72 - fraction * 3.42)];
    const sourceY = fraction * (sideBounds.height - 1);
    const cleanColour = [0,0,0];
    for (let channel = 0; channel < 3; channel++) {
      if (!hasReverse) { cleanColour[channel] = sample(sideBounds.width / 2,sourceY,channel); continue; }
      const before = fraction < .12 ? 0 : fraction > .9 ? .9 : fraction;
      const after = fraction < .12 ? .12 : fraction > .9 ? 1 : fraction;
      const blend = after === before ? 0 : (fraction - before) / (after - before);
      cleanColour[channel] = THREE.MathUtils.lerp(sample(gutterX,before * (sideBounds.height - 1),channel),
        sample(gutterX,after * (sideBounds.height - 1),channel),blend);
    }
    for (let panel = 0; panel < 2; panel++) for (let x = 0; x < panelWidth; x++) {
      // Replicated gutters isolate both panels during bilinear/mipmap filtering.
      const t = THREE.MathUtils.clamp((x - SIDE_GUTTER) / (panelWidth - 2 * SIDE_GUTTER - 1), 0, 1);
      // Advance through actual ray detail instead of stretching the same edge
      // pixels. Both ends still meet the reverse panel at its original150°UV.
      const rearFraction = panel === 0 ? 1 - t * .25 : t * .25;
      const sourceX = reverseLeft + rearFraction * (reverseWidth - 1);
      const alignmentWeight = (1 - THREE.MathUtils.smoothstep(t,0,.4))
        * (fraction < .5 ? 1 - THREE.MathUtils.smoothstep(fraction,.12,.22) : THREE.MathUtils.smoothstep(fraction,.78,.88));
      const railY = (fraction + alignment[panel][fraction < .5 ? 0 : 1] * alignmentWeight) * (sideBounds.height - 1);
      const band = maskAt(sourceX - reverseLeft,railY);
      const edge = (photoY * bounds.width + (panel === 0 ? left : right)) * 4;
      const target = (y * width + panel * panelWidth + x) * 4;
      const mix = THREE.MathUtils.smoothstep(t,0,band > .02 ? .2 : .08);
      for (let channel = 0; channel < 3; channel++) {
        const colour = THREE.MathUtils.lerp(cleanColour[channel],sample(sourceX,railY,channel),band);
        // Continue the exact filtered photograph into the side artwork without
        // adding a bright ring or a diagonal flash at their shared boundary.
        const edgeColour = seamColours[panel]?.[channel] ?? frontPixels[edge + channel];
        data[target + channel] = Math.round(THREE.MathUtils.lerp(edgeColour,colour,mix));
      }
      data[target + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = 'continuous-background-only-can-sides';
  texture.colorSpace = front.colorSpace; texture.flipY = front.flipY;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = front.anisotropy; texture.needsUpdate = true;
  return texture;
}

/** Reuse real brushed lid pixels while removing the photographed pull tab. */
function createLidMetal(source: THREE.DataTexture, bounds: CanReferenceFrame['imageBounds']) {
  const size = 512, data = new Uint8Array(size * size * 4);
  const pixels = source.image.data as Uint8Array;
  const { width, height, left, top, opaqueWidth, opaqueHeight } = bounds;
  const centerX = left + opaqueWidth / 2;
  const centerY = top + opaqueHeight * .032;
  const halfWidth = opaqueWidth * .365;
  const halfHeight = halfWidth * Math.sin(CAN_REFERENCE_ELEVATION);
  const tabLeft = centerX - opaqueWidth * .132, tabRight = centerX + opaqueWidth * .132;
  const tabTop = top + opaqueHeight * .004, tabBottom = top + opaqueHeight * .055;
  const pixelAt = (x: number, y: number, channel: number) => pixels[(
    Math.max(0, Math.min(height - 1, Math.round(y))) * width
    + Math.max(0, Math.min(width - 1, Math.round(x)))
  ) * 4 + channel];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const photoX = centerX + (2 * x / (size - 1) - 1) * halfWidth;
    const photoY = centerY + (2 * y / (size - 1) - 1) * halfHeight;
    const offset = (y * size + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      // The tab exists as a separate perforated mesh. Clean only its image
      // footprint with neighbouring metal, so its baked shape cannot duplicate.
      data[offset + channel] = photoX > tabLeft && photoX < tabRight && photoY > tabTop && photoY < tabBottom
        ? Math.round(THREE.MathUtils.lerp(pixelAt(tabLeft - 3, photoY, channel), pixelAt(tabRight + 3, photoY, channel), (photoX - tabLeft) / (tabRight - tabLeft)))
        : pixelAt(photoX, photoY, channel);
    }
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'approved-brushed-lid-without-baked-tab';
  texture.colorSpace = source.colorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = source.anisotropy; texture.needsUpdate = true;
  return texture;
}

/** Match the coloured cap to real Hero pixels, excluding metal and highlights. */
function referenceTabColor(pixels: ArrayLike<number>, bounds: CanReferenceFrame['imageBounds']) {
  const channels: number[][] = [[], [], []];
  const { width, height, left, top, opaqueWidth, opaqueHeight } = bounds;
  const x0 = Math.max(0, Math.floor(left + opaqueWidth * .39));
  const x1 = Math.min(width, Math.ceil(left + opaqueWidth * .61));
  const y0 = Math.max(0, Math.floor(top + opaqueHeight * .005));
  const y1 = Math.min(height, Math.ceil(top + opaqueHeight * .046));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const offset = (y * width + x) * 4;
    const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    const maximum = Math.max(...rgb), minimum = Math.min(...rgb);
    if (pixels[offset + 3] <= 128 || maximum < 190 || maximum - minimum < maximum * .4) continue;
    for (let channel = 0; channel < 3; channel++) channels[channel].push(rgb[channel]);
  }
  if (channels[0].length < 12) return null;
  const median = channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] / 255);
  return new THREE.Color().setRGB(median[0], median[1], median[2], THREE.SRGBColorSpace);
}

/** Reuse anodised paint and real highlights; the two holes stay in the mesh. */
function createTabFinish(source: THREE.Texture, pixels: ArrayLike<number>, bounds: CanReferenceFrame['imageBounds']) {
  const left = Math.max(0, Math.floor(bounds.left + bounds.opaqueWidth * .39));
  const right = Math.min(bounds.width, Math.ceil(bounds.left + bounds.opaqueWidth * .61));
  const top = Math.max(0, Math.floor(bounds.top + bounds.opaqueHeight * .005));
  const bottom = Math.min(bounds.height, Math.ceil(bounds.top + bounds.opaqueHeight * .046));
  const width = right - left, height = bottom - top;
  if (width < 1 || height < 1) return null;
  const paintedRows: { y: number; xs: number[] }[] = [];
  const coloured = (offset: number) => {
    const high = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    const low = Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    return pixels[offset + 3] > 128 && high >= 140 && high - low >= high * .4;
  };
  for (let y = top; y < bottom; y++) {
    const xs: number[] = [];
    for (let x = left; x < right; x++) if (coloured((y * bounds.width + x) * 4)) xs.push(x);
    if (xs.length) paintedRows.push({ y, xs });
  }
  if (!paintedRows.length) return null;
  const data = new Uint8Array(width * height * 4);
  let nearestRow = 0;
  for (let y = top; y < bottom; y++) {
    while (nearestRow + 1 < paintedRows.length && Math.abs(paintedRows[nearestRow + 1].y - y) < Math.abs(paintedRows[nearestRow].y - y)) nearestRow++;
    const row = paintedRows[nearestRow];
    let nearestX = 0;
    for (let x = left; x < right; x++) {
      while (nearestX + 1 < row.xs.length && Math.abs(row.xs[nearestX + 1] - x) < Math.abs(row.xs[nearestX] - x)) nearestX++;
      const photoX = Math.max(row.xs[0], Math.min(row.xs[row.xs.length - 1], x));
      let offset = (row.y * bounds.width + photoX) * 4;
      const high = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
      // Grey lid and dark photographic holes must not be printed a second
      // time on the physical tab. Retain its real, bright metal glints.
      if (!coloured(offset) && high < 230) offset = (row.y * bounds.width + row.xs[nearestX]) * 4;
      const target = ((y - top) * width + x - left) * 4;
      for (let channel = 0; channel < 3; channel++) data[target + channel] = pixels[offset + channel];
      data[target + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = 'approved-anodised-tab-finish';
  texture.colorSpace = source.colorSpace; texture.flipY = source.flipY;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = source.anisotropy; texture.needsUpdate = true;
  return { texture, left, top, width, height };
}

/**
 * The approved photograph supplies only the printed front wall. Hardware keeps
 * its own opaque metal materials, UVs and actual tab holes, so baked lid/tab
 * pixels cannot appear a second time when the can turns. The photograph also
 * ends at its real 90° silhouette. An empty approved background closes the
 * newly exposed sides; the character is neither mirrored nor stretched across
 * an area that the front photograph never recorded. The actual reverse stays
 * behind the full front-and-side arc.
 * Source textures remain caller-owned.
 */
export function applyCanReference(
  model: CanReferenceModel,
  frontTexture: THREE.Texture,
  backTexture: THREE.Texture,
  sideTexture: THREE.Texture = frontTexture,
): CanReferenceFrame {
  const { pixels, bounds: imageBounds } = samplePhotograph(frontTexture);
  model.group.updateWorldMatrix(true, true);
  const worldToModel = model.group.matrixWorld.clone().invert();
  const meshes: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>; transform: THREE.Matrix4 }[] = [];
  const point = new THREE.Vector3();
  const cosine = Math.cos(CAN_REFERENCE_ELEVATION), sine = Math.sin(CAN_REFERENCE_ELEVATION);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  model.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    const transform = new THREE.Matrix4().multiplyMatrices(worldToModel, mesh.matrixWorld);
    meshes.push({ mesh, transform });
    const positions = mesh.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(transform);
      const projectedY = point.y * cosine - point.z * sine;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, projectedY); maxY = Math.max(maxY, projectedY);
    }
  });
  const width = maxX - minX, height = maxY - minY;
  if (!(width > 0) || !(height > 0)) throw new Error('The can needs a non-empty three-dimensional surface.');
  const bounds = { minX, maxX, minY, maxY, width, height, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
  const { texture: opaqueFront, rowLeft, rowRight } = createOpaquePhotograph(frontTexture, pixels, imageBounds);
  const tabColor = referenceTabColor(pixels, imageBounds);
  const photograph = new THREE.MeshBasicMaterial({ map: opaqueFront, color: 0xffffff, toneMapped: false, fog: false });
  const seamMaps = [new Map<number, PhotographSeamPoint>(), new Map<number, PhotographSeamPoint>()];
  const photoUv = new THREE.Vector2();
  const labelTransform = meshes.find(({mesh}) => mesh === model.label)!.transform;
  const labelPositions = model.label.geometry.getAttribute('position');
  for (let index = 0; index < labelPositions.count; index++) {
    point.fromBufferAttribute(labelPositions, index).applyMatrix4(labelTransform);
    const angle = Math.atan2(point.x, point.z);
    if (Math.abs(Math.abs(angle) - Math.PI / 2) > 1e-6) continue;
    projectPhotograph(point, bounds, imageBounds, rowLeft, rowRight, frontTexture.flipY, photoUv);
    seamMaps[angle < 0 ? 0 : 1].set(point.y, {height: point.y, u: photoUv.x, v: photoUv.y});
  }
  const sortedSeam = (points: Map<number, PhotographSeamPoint>) => [...points.values()].sort((a,b) => a.height - b.height);
  const seams: PhotographSeams = [sortedSeam(seamMaps[0]), sortedSeam(seamMaps[1])];
  const sideBackground = createSideContinuation(opaqueFront, sideTexture, backTexture, imageBounds, bounds, rowLeft, rowRight, seams);
  const sides = new THREE.MeshBasicMaterial({ map: sideBackground, color: 0xffffff, toneMapped: false, fog: false });
  const releaseSides = () => { sides.removeEventListener('dispose', releaseSides); sideBackground.dispose(); };
  sides.addEventListener('dispose', releaseSides);
  const rear = new THREE.MeshBasicMaterial({ map: backTexture, color: 0xffffff, toneMapped: false, fog: false });
  // Material disposal is already part of CanModel.dispose. Associate the derived
  // texture with its one owner without taking ownership of either source image.
  const releaseSurface = () => {
    photograph.removeEventListener('dispose', releaseSurface);
    opaqueFront.dispose();
  };
  photograph.addEventListener('dispose', releaseSurface);
  const replacedMaterials = new Set(Array.isArray(model.label.material) ? model.label.material : [model.label.material]);
  const replacedGeometry = model.label.geometry;
  const replacedGeometries = new Set([replacedGeometry]);

  for (const { mesh, transform } of meshes) {
    if (mesh.name === 'coloured-pull-tab' && tabColor) {
      const cap = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshBasicMaterial;
      const finish = createTabFinish(frontTexture, pixels, imageBounds);
      if (finish) {
        const positions = mesh.geometry.getAttribute('position');
        const uv = new THREE.Float32BufferAttribute(positions.count * 2, 2);
        for (let index = 0; index < positions.count; index++) {
          point.fromBufferAttribute(positions, index).applyMatrix4(transform);
          const imageX = imageBounds.left + (point.x - minX) / width * imageBounds.opaqueWidth;
          const imageY = imageBounds.top + (maxY - (point.y * cosine - point.z * sine)) / height * imageBounds.opaqueHeight;
          uv.setXY(index, (imageX - finish.left) / finish.width,
            finish.texture.flipY ? 1 - (imageY - finish.top) / finish.height : (imageY - finish.top) / finish.height);
        }
        mesh.geometry.setAttribute('uv', uv);
        cap.color.set(0xffffff);
        cap.map = finish.texture;
        cap.needsUpdate = true;
        const releaseTab = () => { cap.removeEventListener('dispose', releaseTab); finish.texture.dispose(); };
        cap.addEventListener('dispose', releaseTab);
      } else cap.color.copy(tabColor);
    }
    // The opaque printed wall, collar, lid and foot close the shell completely.
    // Avoid shading a second full cylinder underneath the approved photograph.
    if (mesh.name === 'can-shell') mesh.visible = false;
    if (mesh.name === 'lid') {
      const lidTexture = createLidMetal(opaqueFront, imageBounds);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) replacedMaterials.add(material);
      const material = new THREE.MeshBasicMaterial({ map: lidTexture, color: 0xffffff, toneMapped: false, fog: false });
      const releaseLid = () => { material.removeEventListener('dispose', releaseLid); lidTexture.dispose(); };
      material.addEventListener('dispose', releaseLid);
      mesh.material = material;
      continue;
    }
    if (['top-rolled-rim', 'bottom-rolled-rim', 'brushed-aluminium-foot'].includes(mesh.name)) {
      // Only axisymmetric metal bands reuse the Hero's actual brushed finish.
      // The lid and pull tab remain separate physical parts: no baked second tab.
      replacedGeometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) replacedMaterials.add(material);
      mesh.geometry = mesh.geometry.clone();
      const positions = mesh.geometry.getAttribute('position');
      const uv = new THREE.Float32BufferAttribute(positions.count * 2, 2);
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(transform);
        // The bottom is a rolled band all around, not the label visible behind
        // the rear half of the photographed base.
        const depth = mesh.name === 'top-rolled-rim' ? point.z : Math.abs(point.z);
        const fractionX = (point.x - minX) / width;
        const fractionY = (maxY - (point.y * cosine - depth * sine)) / height;
        const imageY = (imageBounds.top + fractionY * imageBounds.opaqueHeight) / imageBounds.height;
        uv.setXY(index, (imageBounds.left + fractionX * imageBounds.opaqueWidth) / imageBounds.width,
          frontTexture.flipY ? 1 - imageY : imageY);
      }
      mesh.geometry.setAttribute('uv', uv);
      mesh.geometry.clearGroups();
      mesh.material = new THREE.MeshBasicMaterial({ map: opaqueFront, color: 0xffffff, toneMapped: false, fog: false });
      continue;
    }
    if (mesh !== model.label) continue;
    // Seam triangles need independent UVs. Clone even an unindexed surface so
    // another mesh sharing the original geometry retains its own hardware UVs.
    mesh.geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    const oldUv = geometry.getAttribute('uv');
    const uv = new THREE.Float32BufferAttribute(positions.count * 2, 2);
    const angles = new Float64Array(positions.count);
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(transform);
      const angle = Math.atan2(point.x, point.z);
      angles[index] = angle;
      projectPhotograph(point, bounds, imageBounds, rowLeft, rowRight, frontTexture.flipY, photoUv);
      uv.setXY(index, photoUv.x, photoUv.y);
    }
    geometry.clearGroups();
    let groupStart = 0, materialIndex = -1;
    for (let start = 0; start < positions.count; start += 3) {
      // Boundary vertices belong to both adjoining sectors. A vertex majority
      // gives the two halves of a side quad different materials, collapsing
      // one triangle onto the photograph's last column at each turn extreme.
      // The printed mesh has complete sectors at 90°/150°; classify their
      // interiors so the full quad uses one continuous surface.
      const centerAngle = Math.abs(Math.atan2(
        Math.sin(angles[start]) + Math.sin(angles[start + 1]) + Math.sin(angles[start + 2]),
        Math.cos(angles[start]) + Math.cos(angles[start + 1]) + Math.cos(angles[start + 2]),
      ));
      const inFrontArc = centerAngle < CAN_REFERENCE_FRONT_ARC;
      const inPhotograph = centerAngle < Math.PI / 2;
      const nextMaterial = !inFrontArc ? 1 : inPhotograph ? 0 : 2;
      if (nextMaterial !== materialIndex) {
        if (materialIndex !== -1) geometry.addGroup(groupStart, start - groupStart, materialIndex);
        groupStart = start; materialIndex = nextMaterial;
      }
      if (nextMaterial === 1 && oldUv) for (let index = start; index < start + 3; index++) {
        uv.setXY(index, oldUv.getX(index), oldUv.getY(index));
      }
      if (nextMaterial === 2) for (let index = start; index < start + 3; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(transform);
        const angle = Math.atan2(point.x, point.z);
        const t = THREE.MathUtils.clamp((Math.abs(angle) - Math.PI / 2) / (CAN_REFERENCE_FRONT_ARC - Math.PI / 2), 0, 1);
        // Texel centres prevent the two independent side panels bleeding at u=.5.
        const panelWidth = sideBackground.image.width / 2;
        const x = (angle < 0 ? 0 : panelWidth) + SIDE_GUTTER + .5 + t * (panelWidth - 2 * SIDE_GUTTER - 1);
        uv.setX(index, x / sideBackground.image.width);
        const fraction = (1.72 - point.y) / 3.42;
        uv.setY(index, sideBackground.flipY ? 1 - fraction : fraction);
      }
    }
    if (materialIndex !== -1) geometry.addGroup(groupStart, positions.count - groupStart, materialIndex);
    mesh.material = [photograph, rear, sides];
    geometry.setAttribute('uv', uv);
  }

  // Shared resources retained by another mesh remain alive until model disposal.
  const retainedGeometries = new Set(meshes.map(({ mesh }) => mesh.geometry));
  const retainedMaterials = new Set(meshes.flatMap(({ mesh }) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  for (const geometry of replacedGeometries) if (!retainedGeometries.has(geometry)) geometry.dispose();
  for (const material of replacedMaterials) if (!retainedMaterials.has(material)) material.dispose();
  return { bounds, imageBounds };
}
