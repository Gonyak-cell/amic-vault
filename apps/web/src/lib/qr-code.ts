const version = 10;
const size = 21 + 4 * (version - 1);
const dataCodewordCount = 274;
const eccCodewordsPerBlock = 36;
const blockDataCodewordCount = 137;
const quietZone = 4;
const alignmentPatternCenters = [6, 28, 50];
const maskPattern = 0;
const errorCorrectionLevelLow = 1;

type Module = boolean | null;

interface QrMatrix {
  modules: Module[][];
  reserved: boolean[][];
}

export function qrSvgDataUri(value: string): string {
  const svg = qrSvg(value);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function qrSvg(value: string): string {
  const modules = encodeQrModules(value);
  const viewSize = size + quietZone * 2;
  const cells: string[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules[y]?.[x]) {
        cells.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
      }
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges">`,
    `<path fill="#fff" d="M0 0h${viewSize}v${viewSize}H0z"/>`,
    `<path fill="#111827" d="${cells.join('')}"/>`,
    '</svg>',
  ].join('');
}

function encodeQrModules(value: string): boolean[][] {
  const { modules, reserved } = makeMatrix();
  const codewords = encodeCodewords(value);
  drawCodewords(modules, reserved, codewords);
  drawFormatBits(modules, reserved);
  drawVersionBits(modules, reserved);
  return modules.map((row) => row.map((cell) => cell === true));
}

function makeMatrix(): QrMatrix {
  const modules = Array.from({ length: size }, () => Array<Module>(size).fill(null));
  const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  drawFinder(modules, reserved, 0, 0);
  drawFinder(modules, reserved, size - 7, 0);
  drawFinder(modules, reserved, 0, size - 7);
  drawTimingPatterns(modules, reserved);
  drawAlignmentPatterns(modules, reserved);
  setReserved(modules, reserved, 8, 4 * version + 9, true);
  reserveFormatAreas(reserved);
  reserveVersionAreas(reserved);
  return { modules, reserved };
}

function drawFinder(modules: Module[][], reserved: boolean[][], left: number, top: number): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const x = left + dx;
      const y = top + dy;
      if (!inside(x, y)) continue;
      const black =
        dx >= 0 &&
        dx <= 6 &&
        dy >= 0 &&
        dy <= 6 &&
        (dx === 0 ||
          dx === 6 ||
          dy === 0 ||
          dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setReserved(modules, reserved, x, y, black);
    }
  }
}

function drawTimingPatterns(modules: Module[][], reserved: boolean[][]): void {
  for (let index = 8; index < size - 8; index += 1) {
    const black = index % 2 === 0;
    setReserved(modules, reserved, index, 6, black);
    setReserved(modules, reserved, 6, index, black);
  }
}

function drawAlignmentPatterns(modules: Module[][], reserved: boolean[][]): void {
  for (const y of alignmentPatternCenters) {
    for (const x of alignmentPatternCenters) {
      if ((x === 6 && y === 6) || (x === 6 && y === size - 7) || (x === size - 7 && y === 6)) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const black = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
          setReserved(modules, reserved, x + dx, y + dy, black);
        }
      }
    }
  }
}

function reserveFormatAreas(reserved: boolean[][]): void {
  for (let index = 0; index < 9; index += 1) {
    if (index !== 6) {
      reserved[8]![index] = true;
      reserved[index]![8] = true;
    }
  }
  for (let index = 0; index < 8; index += 1) {
    reserved[8]![size - 1 - index] = true;
    reserved[size - 1 - index]![8] = true;
  }
}

function reserveVersionAreas(reserved: boolean[][]): void {
  for (let y = 0; y < 6; y += 1) {
    for (let x = size - 11; x < size - 8; x += 1) {
      reserved[y]![x] = true;
      reserved[x]![y] = true;
    }
  }
}

function drawFormatBits(modules: Module[][], reserved: boolean[][]): void {
  const bits = formatBits((errorCorrectionLevelLow << 3) | maskPattern);
  for (let index = 0; index <= 5; index += 1)
    setReserved(modules, reserved, 8, index, bit(bits, index));
  setReserved(modules, reserved, 8, 7, bit(bits, 6));
  setReserved(modules, reserved, 8, 8, bit(bits, 7));
  setReserved(modules, reserved, 7, 8, bit(bits, 8));
  for (let index = 9; index < 15; index += 1) {
    setReserved(modules, reserved, 14 - index, 8, bit(bits, index));
  }
  for (let index = 0; index < 8; index += 1) {
    setReserved(modules, reserved, size - 1 - index, 8, bit(bits, index));
  }
  for (let index = 8; index < 15; index += 1) {
    setReserved(modules, reserved, 8, size - 15 + index, bit(bits, index));
  }
}

function drawVersionBits(modules: Module[][], reserved: boolean[][]): void {
  const bits = versionBits(version);
  for (let index = 0; index < 18; index += 1) {
    const x = size - 11 + (index % 3);
    const y = Math.floor(index / 3);
    setReserved(modules, reserved, x, y, bit(bits, index));
    setReserved(modules, reserved, y, x, bit(bits, index));
  }
}

function encodeCodewords(value: string): number[] {
  const input = new TextEncoder().encode(value);
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, input.length, 16);
  for (const byte of input) appendBits(bits, byte, 8);
  if (bits.length > dataCodewordCount * 8) {
    throw new Error('qr_value_too_long');
  }
  appendBits(bits, 0, Math.min(4, dataCodewordCount * 8 - bits.length));
  while (bits.length % 8 !== 0) appendBits(bits, 0, 1);

  const dataCodewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    dataCodewords.push(bitsToByte(bits.slice(index, index + 8)));
  }
  for (let padIndex = 0; dataCodewords.length < dataCodewordCount; padIndex += 1) {
    dataCodewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }

  const blocks = [
    dataCodewords.slice(0, blockDataCodewordCount),
    dataCodewords.slice(blockDataCodewordCount),
  ];
  const eccBlocks = blocks.map((block) => reedSolomonRemainder(block, eccCodewordsPerBlock));
  const result: number[] = [];
  for (let index = 0; index < blockDataCodewordCount; index += 1) {
    for (const block of blocks) result.push(block[index]!);
  }
  for (let index = 0; index < eccCodewordsPerBlock; index += 1) {
    for (const ecc of eccBlocks) result.push(ecc[index]!);
  }
  return result;
}

function drawCodewords(
  modules: Module[][],
  reserved: boolean[][],
  codewords: readonly number[],
): void {
  const bits = codewords.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, index) => ((codeword >>> (7 - index)) & 1) === 1),
  );
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y]![x]) continue;
        const nextBit = bits[bitIndex] ?? false;
        bitIndex += 1;
        modules[y]![x] = nextBit !== mask(maskPattern, x, y);
      }
    }
    upward = !upward;
  }
}

function appendBits(target: number[], value: number, length: number): void {
  for (let index = length - 1; index >= 0; index -= 1) {
    target.push((value >>> index) & 1);
  }
}

function bitsToByte(bits: readonly number[]): number {
  return bits.reduce((sum, next) => (sum << 1) | next, 0);
}

function reedSolomonRemainder(data: readonly number[], degree: number): number[] {
  const generator = reedSolomonGenerator(degree);
  const remainder = Array<number>(degree).fill(0);
  for (const value of data) {
    const factor = value ^ remainder.shift()!;
    remainder.push(0);
    generator.forEach((coefficient, index) => {
      remainder[index] = remainder[index]! ^ gfMultiply(coefficient, factor);
    });
  }
  return remainder;
}

function reedSolomonGenerator(degree: number): number[] {
  let result = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = [1, gfExp(index)];
    const product = Array<number>(result.length + 1).fill(0);
    result.forEach((coefficient, resultIndex) => {
      next.forEach((nextCoefficient, nextIndex) => {
        product[resultIndex + nextIndex] =
          product[resultIndex + nextIndex]! ^ gfMultiply(coefficient, nextCoefficient);
      });
    });
    result = product;
  }
  return result.slice(1);
}

const gfTables = makeGaloisTables();

function makeGaloisTables(): { exp: number[]; log: number[] } {
  const exp = Array<number>(512).fill(0);
  const log = Array<number>(256).fill(0);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) exp[index] = exp[index - 255]!;
  return { exp, log };
}

function gfExp(power: number): number {
  return gfTables.exp[power]!;
}

function gfMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  return gfTables.exp[gfTables.log[left]! + gfTables.log[right]!]!;
}

function formatBits(value: number): number {
  return bchRemainder(value, 10, 0x537) ^ 0x5412;
}

function versionBits(value: number): number {
  return bchRemainder(value, 12, 0x1f25);
}

function bchRemainder(value: number, shift: number, generator: number): number {
  let bits = value << shift;
  for (let index = bitLength(bits) - bitLength(generator); index >= 0; index -= 1) {
    if (((bits >>> (index + bitLength(generator) - 1)) & 1) !== 0) {
      bits ^= generator << index;
    }
  }
  return (value << shift) | bits;
}

function bitLength(value: number): number {
  return value.toString(2).length;
}

function bit(value: number, index: number): boolean {
  return ((value >>> index) & 1) === 1;
}

function mask(pattern: number, x: number, y: number): boolean {
  if (pattern !== 0) throw new Error('unsupported_qr_mask');
  return (x + y) % 2 === 0;
}

function setReserved(
  modules: Module[][],
  reserved: boolean[][],
  x: number,
  y: number,
  black: boolean,
): void {
  if (!inside(x, y)) return;
  modules[y]![x] = black;
  reserved[y]![x] = true;
}

function inside(x: number, y: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size;
}
