/**
 * YTM-Connect — Firefox AMO Package Builder & GitHub Pages Static Site Exporter
 *
 * 1. Prepares `/docs` directory for GitHub Pages (https://zhenxxx7.github.io/ytm-connect/)
 * 2. Builds `ytm-connect-firefox.zip` using POSIX forward-slash (`/`) entry paths
 *    required by Mozilla Add-ons (addons.mozilla.org) validator.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { generateAllIcons } = require('./generate-icons');

// Precompute CRC32 table for ZIP headers
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function collectFilesRecursive(baseDir, relDir = '') {
  const results = [];
  const fullDir = path.join(baseDir, relDir);
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'package.json' || entry.name.startsWith('.')) continue;
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name; // Always forward slash!
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(baseDir, relPath));
    } else if (entry.isFile()) {
      results.push({
        relPath,
        fullPath: path.join(baseDir, relPath)
      });
    }
  }
  return results;
}

function createPosixZip(sourceDir, outZipPath) {
  const files = collectFilesRecursive(sourceDir);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    let rawData = fs.readFileSync(file.fullPath);
    if (file.relPath === 'manifest.json') {
      const firefoxManifest = JSON.parse(rawData.toString('utf8'));
      if (firefoxManifest.background && firefoxManifest.background.scripts) {
        delete firefoxManifest.background.service_worker;
      }
      rawData = Buffer.from(JSON.stringify(firefoxManifest, null, 2), 'utf8');
    }
    const compressed = zlib.deflateRawSync(rawData);
    const crc = crc32(rawData);
    const nameBytes = Buffer.from(file.relPath, 'utf8');

    // Local File Header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // compression method: Deflate (8)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x554a, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localParts.push(localHeader, nameBytes, compressed);

    // Central Directory Header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10); // Deflate
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x554a, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk
    centralHeader.writeUInt16LE(0, 36); // internal attr
    centralHeader.writeUInt32LE(0, 38); // external attr
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBytes);
    offset += 30 + nameBytes.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const zipBuffer = Buffer.concat([...localParts, centralBuffer, eocd]);
  fs.writeFileSync(outZipPath, zipBuffer);
  return { count: files.length, size: zipBuffer.length, entries: files.map((f) => f.relPath) };
}

function buildAll() {
  generateAllIcons();

  const rootDir = path.resolve(__dirname, '..');
  const extDir = path.join(rootDir, 'packages', 'desktop-extension');
  const pwaPublicDir = path.join(rootDir, 'packages', 'mobile-pwa', 'public');
  const docsDir = path.join(rootDir, 'docs');

  // 1. Sync latest bridge.js and overlay.css into extension/mobile/
  fs.copyFileSync(
    path.join(pwaPublicDir, 'bridge.js'),
    path.join(extDir, 'mobile', 'bridge.js')
  );
  fs.copyFileSync(
    path.join(pwaPublicDir, 'overlay.css'),
    path.join(extDir, 'mobile', 'overlay.css')
  );

  // 2. Build /docs for GitHub Pages (https://zhenxxx7.github.io/ytm-connect/)
  fs.mkdirSync(path.join(docsDir, 'icons'), { recursive: true });
  fs.copyFileSync(path.join(extDir, 'mobile', 'bridge.js'), path.join(docsDir, 'bridge.js'));
  fs.copyFileSync(path.join(extDir, 'mobile', 'overlay.css'), path.join(docsDir, 'overlay.css'));
  fs.copyFileSync(
    path.join(extDir, 'mobile', 'mobile-shell.js'),
    path.join(docsDir, 'mobile-shell.js')
  );

  // Adjust icon path for docs/index.html + include manifest.json
  const mobileHtml = fs
    .readFileSync(path.join(extDir, 'mobile', 'index.html'), 'utf8')
    .replace('../icons/icon-128.png', 'icons/icon-192.png')
    .replace(
      '<link rel="stylesheet" href="overlay.css" />',
      '<link rel="manifest" href="manifest.json" />\n  <link rel="apple-touch-icon" href="icons/icon-192.png" />\n  <link rel="stylesheet" href="overlay.css" />'
    );
  fs.writeFileSync(path.join(docsDir, 'index.html'), mobileHtml);

  const docsManifest = {
    name: 'YTM-Connect Mobile',
    short_name: 'YTM-Connect',
    description: 'Spotify Connect for YouTube Music — Serverless Mobile Controller PWA',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#090a0d',
    theme_color: '#090a0d',
    icons: [
      {
        src: 'icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: 'icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ]
  };
  fs.writeFileSync(path.join(docsDir, 'manifest.json'), JSON.stringify(docsManifest, null, 2));
  fs.copyFileSync(
    path.join(pwaPublicDir, 'icons', 'icon-192.png'),
    path.join(docsDir, 'icons', 'icon-192.png')
  );
  fs.copyFileSync(
    path.join(pwaPublicDir, 'icons', 'icon-512.png'),
    path.join(docsDir, 'icons', 'icon-512.png')
  );
  fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');

  // 3. Build POSIX-compliant ytm-connect-firefox.zip
  const zipPath = path.join(rootDir, 'ytm-connect-firefox.zip');
  const result = createPosixZip(extDir, zipPath);
  console.log(`[Build] Created ${zipPath} (${result.size} bytes, ${result.count} files):`);
  console.log('        ' + result.entries.join(', '));
}

if (require.main === module) {
  buildAll();
}

module.exports = { buildAll };
