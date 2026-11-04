import * as THREE from 'three';

/** Reprojects existing approved pixels; never redraws or writes source artwork. */
export function createCanTexture(front: HTMLImageElement, label: HTMLImageElement, anisotropy: number, rearOnly = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536; canvas.height = 1536;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Can texture unavailable');
  const panelWidth = canvas.width / 2;
  context.fillStyle = '#03070b'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  // The front reference already has the approved tall-can layout. Sample only
  // its printed wall, excluding its backdrop, lid and metal foot. The slight
  // shoulder taper follows the silhouette instead of importing background.
  // Runtime models use the exact front photograph on their front surface. Its
  // unused half of this rear atlas does not need 1,536 separate canvas draws.
  for (let row = 0; !rearOnly && row < canvas.height; row++) {
    const fraction = row / canvas.height;
    const shoulder = fraction < .08 ? .9 + fraction / .08 * .1 : 1;
    const sourceWidth = front.naturalWidth * .582 * shoulder;
    context.drawImage(front,
      (front.naturalWidth - sourceWidth) / 2,
      front.naturalHeight * (.085 + fraction * .853),
      sourceWidth, front.naturalHeight * .853 / canvas.height,
      0, row, panelWidth, 1,
    );
  }
  // The approved continuous label contains the reverse panel in its right half.
  const sourceLeft = rearOnly ? 0 : label.naturalWidth / 2;
  const sourceWidth = rearOnly ? label.naturalWidth : label.naturalWidth / 2;
  context.drawImage(label, sourceLeft, 0, sourceWidth, label.naturalHeight,
    panelWidth, 0, panelWidth, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}
