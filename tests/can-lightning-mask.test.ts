import { describe, expect, it } from 'vitest';
import { createLightningMask } from '../src/components/catalog/can-lightning-mask';

function source(fullWidth = 747,height = 200) {
  const pixels = new Uint8Array(fullWidth * height * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([5,35,80,255],i);
  const paint = (x: number,y: number,rgba: number[]) => pixels.set(rgba,(y * fullWidth + x) * 4);
  return { pixels,paint,fullWidth,height,left:30,width:687 };
}

describe('approved lightning emission mask', () => {
  it('retains cyan, yellow, orange and magenta branches at both ends of the label', () => {
    const image = source();
    const colours = [[0,245,255,255],[255,245,20,255],[255,190,20,255],[255,20,245,255]];
    for (const y of [10,189]) for (let colour = 0; colour < colours.length; colour++) {
      for (let branch = 0; branch < 5; branch++) image.paint(image.left + 80 + colour * 130 + branch,y + branch,colours[colour]);
    }
    const before = new Uint8Array(image.pixels);
    const mask = createLightningMask(image.pixels,image.fullWidth,image.height,image.left,image.width);
    expect(mask).toHaveLength(image.width * image.height);
    for (const y of [10,189]) for (let colour = 0; colour < colours.length; colour++) for (let branch = 0; branch < 5; branch++) {
      expect(mask[(y + branch) * image.width + 80 + colour * 130 + branch]).toBe(1);
    }
    expect(image.pixels.every((value,index) => value === before[index])).toBe(true);
    expect(mask.every(value => value >= 0 && value <= 1)).toBe(true);
  });

  it('includes a nearby white hot core and softly fades out without admitting a distant white banner', () => {
    const image = source();
    image.paint(image.left + 100,10,[0,245,255,255]);
    for (let x = 101; x <= 120; x++) image.paint(image.left + x,10,[255,255,255,255]);
    for (let y = 5; y < 20; y++) for (let x = 300; x < 390; x++) image.paint(image.left + x,y,[255,255,255,255]);
    const mask = createLightningMask(image.pixels,image.fullWidth,image.height,image.left,image.width);
    const at = (x: number,y = 10) => mask[y * image.width + x];
    expect(at(103)).toBe(1);
    expect(at(106)).toBeGreaterThan(at(109));
    expect(at(109)).toBeGreaterThan(0);
    expect(at(111)).toBe(0);
    expect(at(340)).toBe(0);
    expect(at(390)).toBe(0);
  });

  it('never exposes middle-body bolts, transparent RGB or seeds outside the selected reverse panel', () => {
    const image = source();
    image.paint(image.left + 100,100,[0,255,255,255]);
    image.paint(image.left + 200,10,[255,20,255,0]);
    image.paint(image.left - 1,10,[0,255,255,255]);
    image.paint(image.left + image.width,189,[255,245,0,255]);
    const mask = createLightningMask(image.pixels,image.fullWidth,image.height,image.left,image.width);
    expect(mask.every(value => value === 0)).toBe(true);
  });
});
