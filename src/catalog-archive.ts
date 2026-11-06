import AdmZip from 'adm-zip';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const MAX_COMPRESSED = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED = 100 * 1024 * 1024;
const MAX_ENTRIES = 1000;

/** Extract an untrusted catalog archive into a private temporary directory. */
export async function extractCatalogZip(base64: string): Promise<{ directory: string; cleanup: () => Promise<void> }> {
  if (typeof base64 !== 'string' || !base64.length || base64.length > Math.ceil(MAX_COMPRESSED / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new Error('El ZIP del catálogo no contiene base64 válido o supera el límite de tamaño.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_COMPRESSED || bytes.toString('base64') !== base64) {
    throw new Error('El ZIP del catálogo no contiene base64 válido o supera el límite de tamaño.');
  }

  let entries: AdmZip.IZipEntry[];
  try {
    entries = new AdmZip(bytes).getEntries().filter(entry => !(entry as AdmZip.IZipEntry & { temporary?: boolean }).temporary);
  } catch {
    throw new Error('El ZIP del catálogo no es válido.');
  }
  if (entries.length > MAX_ENTRIES) throw new Error('El ZIP contiene demasiadas entradas.');

  const paths = new Map<string, boolean>();
  let total = 0;
  let skillPath: string[] | undefined;
  for (const entry of entries) {
    const name = entry.entryName;
    const parts = (entry.isDirectory ? name.slice(0, -1) : name).split('/');
    if (name.length > 1024 || parts.length > 64 || parts.some(part =>
      !part || part === '.' || part === '..' || part.length > 255 ||
      /[\x00-\x1f\x7f<>:"\\|?*]/.test(part) || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
      throw new Error('El ZIP contiene una ruta no permitida.');
    }
    const key = parts.join('/').toLowerCase();
    if (paths.has(key)) throw new Error('El ZIP contiene rutas duplicadas.');
    paths.set(key, entry.isDirectory);
    const type = (entry.header.attr >>> 16) & 0o170000;
    if ((type !== 0 && type !== 0o100000 && type !== 0o040000) ||
        (type === 0o040000 && !entry.isDirectory) || (type === 0o100000 && entry.isDirectory)) {
      throw new Error('El ZIP contiene enlaces o tipos de archivo no permitidos.');
    }
    if (entry.header.encrypted || (entry.header.flags & 0x41) !== 0 || ![0, 8].includes(entry.header.method)) {
      throw new Error('El ZIP contiene archivos cifrados o con compresión no compatible.');
    }
    total += entry.header.size;
    if (total > MAX_UNCOMPRESSED || entry.header.compressedSize > MAX_COMPRESSED ||
        (entry.isDirectory && (entry.header.size !== 0 || entry.header.compressedSize !== 0))) {
      throw new Error('El ZIP supera los límites de tamaño permitidos.');
    }
    try {
      entry.header.loadLocalHeaderFromBinary(bytes);
      const local = entry.header.localHeader;
      const start = entry.header.offset + 30;
      const end = start + Number(local.fnameLen);
      if (end > bytes.length || !bytes.subarray(start, end).equals(entry.rawEntryName) ||
          local.flags !== entry.header.flags || local.method !== entry.header.method ||
          entry.header.realDataOffset + entry.header.compressedSize > bytes.length ||
          (!entry.header.flags_desc && (local.size !== entry.header.size || local.compressedSize !== entry.header.compressedSize || local.crc !== entry.header.crc))) {
        throw new Error('Cabecera inconsistente');
      }
    } catch {
      throw new Error('El ZIP contiene cabeceras inválidas o inconsistentes.');
    }
    if (!entry.isDirectory && parts[parts.length - 1] === 'SKILL.md') {
      if (skillPath) throw new Error('El ZIP contiene varias skills.');
      skillPath = parts.slice(0, -1);
    }
  }
  if (!skillPath) throw new Error('El ZIP no contiene ningún SKILL.md.');
  for (const [path] of paths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (paths.get(parts.slice(0, i).join('/')) === false) throw new Error('El ZIP contiene rutas incompatibles.');
    }
  }

  const root = await mkdtemp(join(tmpdir(), 'office-catalog-'));
  const cleanup = async () => { await rm(root, { recursive: true, force: true }); };
  try {
    for (const entry of entries) {
      const path = join(root, ...entry.entryName.split('/'));
      if (entry.isDirectory) {
        await mkdir(path, { recursive: true });
      } else {
        let data: Buffer;
        try { data = entry.getData(); } catch { throw new Error('El ZIP contiene datos dañados o demasiado grandes.'); }
        if (data.length !== entry.header.size) throw new Error('El ZIP contiene longitudes de archivo inválidas.');
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, data, { flag: 'wx' });
      }
    }
    return { directory: join(root, ...skillPath), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
