// Lossless browser textures. The approved PNG artwork is always read-only.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'public/images/can-runtime');
const MANIFEST = path.join(ROOT, 'src/components/catalog/can-textures.generated.json');
const SLUGS = ['original', 'citricos', 'tropicais', 'frutas-vermelhas'];
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function verifyPixels(expected, actual) {
  if (expected.info.width !== actual.info.width || expected.info.height !== actual.info.height
    || expected.info.channels !== 4 || actual.info.channels !== 4 || expected.data.length !== actual.data.length) {
    throw new Error('Can texture dimensions or channels changed');
  }
  if (!expected.data.equals(actual.data)) throw new Error('Lossless can texture changed approved pixels');
}

async function prepare() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const previous = await fs.readFile(MANIFEST, 'utf8').then(JSON.parse).catch(() => null);
  const manifest = { version: 1, textures: {}, originalBytes: 0, runtimeBytes: 0 };
  for (const slug of SLUGS) {
    const textures = {};
    for (const [kind, sourceFolder] of [['front', 'cans'], ['rear', 'labels'], ['sides', 'can-sides']]) {
      const source = `public/images/${sourceFolder}/${slug}.png`;
      const input = await fs.readFile(path.join(ROOT, source));
      const sourceSha256 = sha256(input);
      const metadata = await sharp(input).metadata();
      if (!metadata.width || !metadata.height) throw new Error(`Missing dimensions: ${source}`);
      // Only the right half of a flat label is ever used as the reverse panel.
      const crop = kind === 'rear'
        ? { left: metadata.width / 2, top: 0, width: metadata.width / 2, height: metadata.height }
        : undefined;
      if (crop && !Number.isInteger(crop.left)) throw new Error('The continuous label must have two equal panels');
      const cached = previous?.version === 1 ? previous.textures?.[slug]?.[kind] : undefined;
      if (cached?.sourceSha256 === sourceSha256 && cached.width === (crop?.width ?? metadata.width)
        && cached.height === metadata.height && /^\/images\/can-runtime\/[a-z0-9-]+\.webp$/.test(cached.url)) {
        const bytes = await fs.readFile(path.join(ROOT, 'public', cached.url.slice(1))).catch(() => null);
        if (bytes && sha256(bytes) === cached.outputSha256 && bytes.length === cached.bytes) {
          textures[kind] = cached; manifest.originalBytes += input.length; manifest.runtimeBytes += bytes.length;
          continue;
        }
      }
      let sourceImage = sharp(input);
      if (crop) sourceImage = sourceImage.extract(crop);
      const sourcePixels = await sourceImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const encoded = await sharp(sourcePixels.data, { raw: sourcePixels.info })
        .webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
      const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      verifyPixels(sourcePixels, decoded);
      const outputSha256 = sha256(encoded);
      const filename = `${slug}-${kind}-${sourceSha256.slice(0, 12)}-${outputSha256.slice(0, 8)}.webp`;
      const output = path.join(OUTPUT, filename);
      const existing = await fs.readFile(output).catch(() => null);
      if (!existing || sha256(existing) !== outputSha256) await fs.writeFile(output, encoded);
      textures[kind] = {
        url: `/images/can-runtime/${filename}`, source, sourceSha256, outputSha256,
        width: decoded.info.width, height: decoded.info.height, bytes: encoded.length,
        ...(crop ? { crop } : {}),
      };
      manifest.originalBytes += input.length;
      manifest.runtimeBytes += encoded.length;
      console.log(`Verified identical RGBA: ${slug}/${kind} ${input.length} -> ${encoded.length} bytes`);
    }
    manifest.textures[slug] = textures;
  }
  const contents = JSON.stringify(manifest, null, 2) + '\n';
  if (await fs.readFile(MANIFEST, 'utf8').catch(() => '') !== contents) await fs.writeFile(MANIFEST, contents);
  console.log(JSON.stringify({ originalBytes:manifest.originalBytes, runtimeBytes:manifest.runtimeBytes,
    reduction: `${(100 * (1 - manifest.runtimeBytes / manifest.originalBytes)).toFixed(1)}%` }));
}

module.exports = { verifyPixels };
if (require.main === module) prepare().catch(error => { console.error(error); process.exitCode = 1; });
