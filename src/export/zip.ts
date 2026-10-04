/**
 * A tiny STORE-only (uncompressed) zip writer. A Procreate .swatches file is
 * just a zip with one Swatches.json inside, so pulling in a zip library for
 * that would be all supply-chain risk and no benefit.
 */

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let tableIndex = 0; tableIndex < 256; tableIndex++) {
    let crc = tableIndex;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[tableIndex] = crc >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  fileName: string;
  contents: Uint8Array;
}

export function createZip(entries: ZipEntry[], modifiedAt: Date = new Date()): Uint8Array {
  const textEncoder = new TextEncoder();
  const dosTime = (modifiedAt.getHours() << 11) | (modifiedAt.getMinutes() << 5) | Math.floor(modifiedAt.getSeconds() / 2);
  const dosDate = ((Math.max(1980, modifiedAt.getFullYear()) - 1980) << 9) | ((modifiedAt.getMonth() + 1) << 5) | modifiedAt.getDate();

  const localSections: Uint8Array[] = [];
  const centralSections: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.fileName);
    const checksum = crc32(entry.contents);
    const size = entry.contents.length;

    const localHeader = new DataView(new ArrayBuffer(30));
    localHeader.setUint32(0, 0x04034b50, true);
    localHeader.setUint16(4, 20, true); // version needed
    localHeader.setUint16(6, 0x0800, true); // UTF-8 names
    localHeader.setUint16(8, 0, true); // STORE
    localHeader.setUint16(10, dosTime, true);
    localHeader.setUint16(12, dosDate, true);
    localHeader.setUint32(14, checksum, true);
    localHeader.setUint32(18, size, true);
    localHeader.setUint32(22, size, true);
    localHeader.setUint16(26, nameBytes.length, true);
    localHeader.setUint16(28, 0, true);
    localSections.push(new Uint8Array(localHeader.buffer), nameBytes, entry.contents);

    const centralHeader = new DataView(new ArrayBuffer(46));
    centralHeader.setUint32(0, 0x02014b50, true);
    centralHeader.setUint16(4, 20, true); // version made by
    centralHeader.setUint16(6, 20, true); // version needed
    centralHeader.setUint16(8, 0x0800, true);
    centralHeader.setUint16(10, 0, true);
    centralHeader.setUint16(12, dosTime, true);
    centralHeader.setUint16(14, dosDate, true);
    centralHeader.setUint32(16, checksum, true);
    centralHeader.setUint32(20, size, true);
    centralHeader.setUint32(24, size, true);
    centralHeader.setUint16(28, nameBytes.length, true);
    centralHeader.setUint32(42, localOffset, true);
    centralSections.push(new Uint8Array(centralHeader.buffer), nameBytes);

    localOffset += 30 + nameBytes.length + size;
  }

  const centralDirectorySize = centralSections.reduce((total, section) => total + section.length, 0);
  const endRecord = new DataView(new ArrayBuffer(22));
  endRecord.setUint32(0, 0x06054b50, true);
  endRecord.setUint16(8, entries.length, true);
  endRecord.setUint16(10, entries.length, true);
  endRecord.setUint32(12, centralDirectorySize, true);
  endRecord.setUint32(16, localOffset, true);

  return concatenateBytes([...localSections, ...centralSections, new Uint8Array(endRecord.buffer)]);
}

export function concatenateBytes(sections: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(sections.reduce((total, section) => total + section.length, 0));
  let writeOffset = 0;
  for (const section of sections) {
    output.set(section, writeOffset);
    writeOffset += section.length;
  }
  return output;
}
