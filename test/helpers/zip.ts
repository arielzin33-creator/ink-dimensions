// Reads a store-only ZIP through its central directory, independently of the writer.
export function readZip(buf: Buffer): Array<{ name: string; data: Buffer; crc: number }> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no end of central directory');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Array<{ name: string; data: Buffer; crc: number }> = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header');
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('bad local header');
    const lNameLen = buf.readUInt16LE(local + 26);
    const data = buf.subarray(local + 30 + lNameLen, local + 30 + lNameLen + size);
    out.push({ name, data, crc });
    p += 46 + nameLen;
  }
  return out;
}

