/**
 * Keep the approved coloured lightning and its nearby white core/halo, while
 * excluding neutral label panels and everything in the middle of the can.
 * Coordinates are RGBA source pixels; the returned mask is local to the crop.
 */
export function createLightningMask(
  pixels: ArrayLike<number>, fullWidth: number, height: number, left: number, width: number,
  bands = { upper:.12, lower:.88 },
): Float32Array {
  if (![fullWidth,height,left,width].every(Number.isSafeInteger) || fullWidth < 1 || height < 1
    || left < 0 || width < 1 || left + width > fullWidth || pixels.length < fullWidth * height * 4) {
    throw new RangeError('Invalid lightning mask dimensions.');
  }
  const mask = new Float32Array(width * height);
  const radius = Math.max(2,Math.round(width * 10 / 687));
  const solidRadius = radius * .4;
  const diagonal = Math.SQRT2;

  const fillBand = (firstRow: number,lastRow: number) => {
    const rows = lastRow - firstRow + 1;
    const distance = new Float32Array(width * rows).fill(radius + 1);
    for (let y = 0; y < rows; y++) for (let x = 0; x < width; x++) {
      const source = ((firstRow + y) * fullWidth + left + x) * 4;
      if (pixels[source + 3] <= 128) continue;
      const r = pixels[source], g = pixels[source + 1], b = pixels[source + 2];
      const maximum = Math.max(r,g,b), minimum = Math.min(r,g,b);
      const second = r + g + b - maximum - minimum;
      if (maximum >= 230 && second >= 180 && maximum - minimum >= 60) distance[y * width + x] = 0;
    }
    // Two bounded chamfer passes grow a soft neighbourhood in linear time.
    // A white hot core inherits nearby coloured glow; a distant paper panel
    // cannot become a seed merely because it is bright.
    for (let y = 0; y < rows; y++) for (let x = 0; x < width; x++) {
      const at = y * width + x;
      let value = distance[at];
      if (x > 0) value = Math.min(value,distance[at - 1] + 1);
      if (y > 0) {
        value = Math.min(value,distance[at - width] + 1);
        if (x > 0) value = Math.min(value,distance[at - width - 1] + diagonal);
        if (x + 1 < width) value = Math.min(value,distance[at - width + 1] + diagonal);
      }
      distance[at] = value;
    }
    for (let y = rows - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
      const at = y * width + x;
      let value = distance[at];
      if (x + 1 < width) value = Math.min(value,distance[at + 1] + 1);
      if (y + 1 < rows) {
        value = Math.min(value,distance[at + width] + 1);
        if (x > 0) value = Math.min(value,distance[at + width - 1] + diagonal);
        if (x + 1 < width) value = Math.min(value,distance[at + width + 1] + diagonal);
      }
      distance[at] = value;
      const source = ((firstRow + y) * fullWidth + left + x) * 4;
      if (pixels[source + 3] <= 128 || value >= radius) continue;
      const fade = Math.max(0,(value - solidRadius) / (radius - solidRadius));
      mask[(firstRow + y) * width + x] = 1 - fade * fade * (3 - 2 * fade);
    }
  };
  fillBand(0,Math.floor((height - 1) * bands.upper));
  fillBand(Math.ceil((height - 1) * bands.lower),height - 1);
  return mask;
}
