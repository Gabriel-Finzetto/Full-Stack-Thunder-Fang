const PRODUCT_ARTWORK_VERSION = 'anatomical-paws-sides-20261101';

/** Refresh corrected can photography in browser and optimized-image caches. */
export function productArtwork(src: string): string {
  const match = src.match(/^(\/images\/(?:cans|products|can-sides)\/[^/?#]+\.png)(\?[^#]*)?(#.*)?$/);
  if (!match) return src;
  const query = new URLSearchParams(match[2]);
  query.set('v', PRODUCT_ARTWORK_VERSION);
  return `${match[1]}?${query}${match[3] ?? ''}`;
}

export function canArtwork(slug: string): string {
  return productArtwork(`/images/cans/${slug}.png`);
}
