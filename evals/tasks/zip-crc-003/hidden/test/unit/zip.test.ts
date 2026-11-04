import { crc32 as zlibCrc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createZip, crc32 } from '../../src/server/zip.js';
import { readZip } from '../helpers/zip.js';

describe('zip writer', () => {
  it('computes CRC-32 like zlib', () => {
    for (const s of ['', 'a', 'hello world', '<svg>ünïcode</svg>']) expect(crc32(Buffer.from(s))).toBe(zlibCrc32(Buffer.from(s)));
  });

  it('writes entries readable through the central directory with valid CRCs', () => {
    const zip = createZip([
      { name: 'comic/page-01.svg', data: Buffer.from('<svg>1</svg>') },
      { name: 'comic/page-02.svg', data: Buffer.from('<svg>2</svg>') },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['comic/page-01.svg', 'comic/page-02.svg']);
    for (const e of entries) expect(zlibCrc32(e.data)).toBe(e.crc);
    expect(entries[1]?.data.toString()).toBe('<svg>2</svg>');
    expect(createZip([{ name: 'a', data: Buffer.from('x') }]).equals(createZip([{ name: 'a', data: Buffer.from('x') }]))).toBe(true);
  });

  it('refuses unsafe entry names', () => {
    expect(() => createZip([{ name: '../evil', data: Buffer.from('') }])).toThrow(/unsafe/);
  });
});
