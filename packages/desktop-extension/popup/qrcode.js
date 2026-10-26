/**
 * YTM-Connect — Zero-Dependency ISO/IEC 18004 QR Code SVG Generator (Level L, Versions 1-10)
 * Renders crisp, scannable SVG QR codes inside Manifest V3 extension popups with zero external requests.
 */
(function (global) {
  // Total codewords and EC codewords per block for Error Correction Level L (Versions 1..10)
  const VERSION_TABLE_L = [
    null,
    { total: 26, ecPerBlock: 7, blocks1: 1, data1: 19, blocks2: 0, data2: 0, align: [] },
    { total: 44, ecPerBlock: 10, blocks1: 1, data1: 34, blocks2: 0, data2: 0, align: [6, 18] },
    { total: 70, ecPerBlock: 15, blocks1: 1, data1: 55, blocks2: 0, data2: 0, align: [6, 22] },
    { total: 100, ecPerBlock: 20, blocks1: 1, data1: 80, blocks2: 0, data2: 0, align: [6, 26] },
    { total: 134, ecPerBlock: 26, blocks1: 1, data1: 108, blocks2: 0, data2: 0, align: [6, 30] },
    { total: 172, ecPerBlock: 18, blocks1: 2, data1: 68, blocks2: 0, data2: 0, align: [6, 34] },
    { total: 196, ecPerBlock: 20, blocks1: 2, data1: 78, blocks2: 0, data2: 0, align: [6, 22, 38] },
    { total: 242, ecPerBlock: 24, blocks1: 2, data1: 97, blocks2: 0, data2: 0, align: [6, 24, 42] },
    { total: 292, ecPerBlock: 30, blocks1: 2, data1: 116, blocks2: 0, data2: 0, align: [6, 26, 46] },
    { total: 346, ecPerBlock: 18, blocks1: 2, data1: 68, blocks2: 2, data2: 69, align: [6, 28, 50] }
  ];

  // GF(256) log/exp tables with primitive polynomial 0x11d
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGaloisField() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) {
      const next = new Uint8Array(poly.length + 1);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const rem = new Uint8Array(ecLen);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rem[0];
      rem.copyWithin(0, 1);
      rem[ecLen - 1] = 0;
      if (factor !== 0) {
        for (let j = 0; j < ecLen; j++) {
          rem[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return rem;
  }

  function selectVersion(byteLen) {
    for (let v = 1; v <= 10; v++) {
      const info = VERSION_TABLE_L[v];
      const totalDataCap = info.blocks1 * info.data1 + info.blocks2 * info.data2;
      const headerBits = v <= 9 ? 4 + 8 : 4 + 16;
      const maxBytes = Math.floor((totalDataCap * 8 - headerBits) / 8);
      if (byteLen <= maxBytes) return v;
    }
    throw new Error('QR payload exceeds Version 10 capacity');
  }

  function buildDataCodewords(bytes, version) {
    const info = VERSION_TABLE_L[version];
    const totalDataCodewords = info.blocks1 * info.data1 + info.blocks2 * info.data2;
    const bits = [];

    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >>> i) & 1);
      }
    }

    // Mode indicator: Byte mode (0100)
    pushBits(0b0100, 4);
    // Character count indicator
    pushBits(bytes.length, version <= 9 ? 8 : 16);
    for (let i = 0; i < bytes.length; i++) {
      pushBits(bytes[i], 8);
    }

    // Terminator (up to 4 zero bits)
    const maxBits = totalDataCodewords * 8;
    const term = Math.min(4, maxBits - bits.length);
    pushBits(0, term);

    while (bits.length % 8 !== 0) {
      bits.push(0);
    }

    const codewords = new Uint8Array(totalDataCodewords);
    const byteCount = bits.length / 8;
    for (let i = 0; i < byteCount; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bits[i * 8 + j];
      }
      codewords[i] = b;
    }

    const padBytes = [0xec, 0x11];
    for (let i = byteCount; i < totalDataCodewords; i++) {
      codewords[i] = padBytes[(i - byteCount) % 2];
    }

    // Split into blocks and compute RS error correction
    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;

    for (let b = 0; b < info.blocks1; b++) {
      const slice = codewords.subarray(offset, offset + info.data1);
      offset += info.data1;
      dataBlocks.push(slice);
      ecBlocks.push(rsEncode(slice, info.ecPerBlock));
    }

    for (let b = 0; b < info.blocks2; b++) {
      const slice = codewords.subarray(offset, offset + info.data2);
      offset += info.data2;
      dataBlocks.push(slice);
      ecBlocks.push(rsEncode(slice, info.ecPerBlock));
    }

    // Interleave data codewords + EC codewords
    const finalBytes = [];
    const maxDataLen = Math.max(info.data1, info.data2);
    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < dataBlocks.length; b++) {
        if (i < dataBlocks[b].length) {
          finalBytes.push(dataBlocks[b][i]);
        }
      }
    }
    for (let i = 0; i < info.ecPerBlock; i++) {
      for (let b = 0; b < ecBlocks.length; b++) {
        finalBytes.push(ecBlocks[b][i]);
      }
    }

    return finalBytes;
  }

  function createMatrix(version, codewords) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunction = Array.from({ length: size }, () => new Uint8Array(size));

    function setFunctionModule(r, c, dark) {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      modules[r][c] = dark ? 1 : 0;
      isFunction[r][c] = 1;
    }

    function drawFinder(row, col) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const isBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setFunctionModule(r, c, inOuter && (isBorder || isInner));
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setFunctionModule(6, i, i % 2 === 0);
      setFunctionModule(i, 6, i % 2 === 0);
    }

    // Alignment patterns
    const alignCoords = VERSION_TABLE_L[version].align;
    for (let i = 0; i < alignCoords.length; i++) {
      for (let j = 0; j < alignCoords.length; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === alignCoords.length - 1) ||
          (i === alignCoords.length - 1 && j === 0)
        ) {
          continue;
        }
        const cr = alignCoords[i];
        const cc = alignCoords[j];
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setFunctionModule(cr + dr, cc + dc, dark);
          }
        }
      }
    }

    // Dark module & reserve format info areas
    setFunctionModule(size - 8, 8, true);
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        if (!isFunction[8][i]) setFunctionModule(8, i, false);
        if (!isFunction[i][8]) setFunctionModule(i, 8, false);
      }
    }
    for (let i = 0; i < 8; i++) {
      if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
      if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
    }

    // Version 7+ version info areas
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) {
        rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      }
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFunctionModule(a, b, dark);
        setFunctionModule(b, a, dark);
      }
    }

    // Place data bits in upward/downward 2-column zig-zag
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          const upward = ((right + 1) & 2) === 0;
          const r = upward ? size - 1 - vert : vert;
          if (!isFunction[r][c] && bitIdx < totalBits) {
            const bit = (codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
            modules[r][c] = bit;
            bitIdx++;
          }
        }
      }
    }

    // Apply Mask 0 ((r + c) % 2 === 0) and write format bits for Level L (01) + Mask 0 (000)
    const maskPattern = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunction[r][c] && (r + c) % 2 === 0) {
          modules[r][c] ^= 1;
        }
      }
    }

    // Compute format bits: EC Level L = 01, mask = 000 -> data = 0b01000 = 8
    const formatData = (0b01 << 3) | maskPattern;
    let rem = formatData;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    const formatBits = ((formatData << 10) | rem) ^ 0x5412;

    function getFormatBit(i) {
      return ((formatBits >>> i) & 1) !== 0;
    }

    for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getFormatBit(i));
    setFunctionModule(8, 7, getFormatBit(6));
    setFunctionModule(8, 8, getFormatBit(7));
    setFunctionModule(7, 8, getFormatBit(8));
    for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getFormatBit(i));

    for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, getFormatBit(i));
    for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, getFormatBit(i));
    setFunctionModule(size - 8, 8, true);

    return modules;
  }

  function renderQrSvg(text, options = {}) {
    const bytes = new TextEncoder().encode(String(text || ''));
    const version = selectVersion(bytes.length);
    const codewords = buildDataCodewords(bytes, version);
    const matrix = createMatrix(version, codewords);

    const count = matrix.length;
    const margin = options.margin ?? 2;
    const total = count + margin * 2;
    const fg = options.foreground || '#08120c';
    const bg = options.background || '#ffffff';

    let pathData = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (matrix[r][c]) {
          pathData += `M${c + margin},${r + margin}h1v1h-1z`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" width="100%" height="100%">
      <rect width="${total}" height="${total}" rx="2" fill="${bg}"/>
      <path d="${pathData}" fill="${fg}"/>
    </svg>`;
  }

  global.YtmConnectQR = { renderQrSvg };
})(window);
