/**
 * 相册构建核心：扫描 `photos/` 目录，生成缩略图 / 大图 / blurhash，
 * 并把全部元信息汇总成 manifest。
 *
 * 目录约定：
 *   photos/<年份>/<地点>/<标题>.<ext>   照片（目录直接决定年份和地点，可以省略）
 *   photos/gallery.json                所有照片的文案（一个文件，可选）
 *
 * 以 `_` 或 `.` 开头的目录 / 文件会被跳过（放草稿用）。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { encode as encodeBlurHash } from 'blurhash';
import exifr from 'exifr';
import sharp from 'sharp';

export const PHOTOS_DIR = 'photos';
export const CONFIG_FILENAME = 'gallery.json';
export const CONFIG_PATH = path.join(PHOTOS_DIR, CONFIG_FILENAME);
export const OUTPUT_DIR = path.join('public', 'generated');
export const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const CACHE_PATH = path.join('.cache', 'gallery-images.json');

const THUMB_WIDTH = 800;
const LARGE_WIDTH = 2560;
const THUMB_QUALITY = 76;
const LARGE_QUALITY = 82;
const BLURHASH_COMPONENTS = [4, 4];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const CONFIG_FIELDS = ['title', 'location', 'date', 'desc'];
const CONCURRENCY = 2;

const toPosix = (value) => value.split(path.sep).join('/');

async function walk(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(abs)));
    } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(abs);
    }
  }
  return files;
}

/* ------------------------------------------------------------------ 文案配置 */

/** 只保留认识的字段，去掉空值；全空返回 null */
function normalizeConfigEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const out = {};
  for (const key of CONFIG_FIELDS) {
    const value = typeof entry[key] === 'string' ? entry[key].trim() : '';
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** 读 photos/gallery.json，键是相对 photos/ 的路径 */
export async function readGalleryConfig(root = process.cwd()) {
  const file = path.join(root, CONFIG_PATH);
  let text;
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${CONFIG_FILENAME} 不是合法 JSON：${error.message}`);
  }

  const entries = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const normalized = normalizeConfigEntry(value);
    if (normalized) entries[toPosix(key)] = normalized;
  }
  return entries;
}

/** 按路径排序后写回，内容没变就不动文件（避免无意义的 git diff） */
async function writeGalleryConfig(root, entries) {
  const sorted = {};
  for (const key of Object.keys(entries).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = entries[key];
  }
  const text = `${JSON.stringify(sorted, null, 2)}\n`;
  const file = path.join(root, CONFIG_PATH);

  let previous = null;
  try {
    previous = await fsp.readFile(file, 'utf8');
  } catch {
    previous = null;
  }
  if (previous === text) return false;

  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, 'utf8');
  return true;
}

/** `2024` / `2024-02` / `2024-02-09` / `2024/2/9` → { year, month, day } */
function parseDateParts(value) {
  if (!value) return null;
  const match = /^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?$/.exec(String(value).trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: match[2] ? Number(match[2]) : null,
    day: match[3] ? Number(match[3]) : null,
  };
}

const pad = (value) => String(value).padStart(2, '0');

function partsToDate(parts) {
  if (!parts) return null;
  if (!parts.month || !parts.day) return null;
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

async function readExifDate(abs) {
  try {
    const exif = await exifr.parse(abs, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] });
    const date = exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.ModifyDate;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  } catch {
    return null;
  }
}

/** 目录层级 → 年份 / 地点 */
function parseLocationInfo(relativePath) {
  const segments = toPosix(relativePath).split('/');
  const dirs = segments.slice(0, -1);
  const yearDir = /^\d{4}$/.test(dirs[0] ?? '') ? Number(dirs[0]) : null;
  const location = (yearDir ? dirs.slice(1) : dirs).join('，');
  return { yearDir, locationFromPath: location };
}

/* ---------------------------------------------------------------- 图片处理 */

function hashFile(abs) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(abs)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex').slice(0, 12)))
      .on('error', reject);
  });
}

async function imageSize(abs) {
  const meta = await sharp(abs).metadata();
  let { width, height } = meta;
  if ((meta.orientation ?? 1) >= 5) [width, height] = [height, width];
  return { width, height };
}

async function makeBlurHash(abs) {
  const { data, info } = await sharp(abs)
    .rotate()
    .resize({ width: 32, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encodeBlurHash(
    Uint8ClampedArray.from(data),
    info.width,
    info.height,
    BLURHASH_COMPONENTS[0],
    BLURHASH_COMPONENTS[1],
  );
}

async function renderVariants(abs, { thumbPath, largePath }) {
  await sharp(abs)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY, effort: 4 })
    .toFile(thumbPath);
  await sharp(abs)
    .rotate()
    .resize({ width: LARGE_WIDTH, withoutEnlargement: true })
    .webp({ quality: LARGE_QUALITY, effort: 4 })
    .toFile(largePath);
}

async function limitMap(items, limit, mapper) {
  const results = Array.from({ length: items.length });
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/* ------------------------------------------------------------------ 主流程 */

async function readCache(root) {
  try {
    return JSON.parse(await fsp.readFile(path.join(root, CACHE_PATH), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * 扫描 photos/ 并生成全部产物，返回 manifest。
 * @param {{ root?: string, log?: Console, force?: boolean }} options
 */
export async function buildGallery(options = {}) {
  const { root = process.cwd(), log = console, force = false } = options;
  const photosRoot = path.join(root, PHOTOS_DIR);
  const outputDir = path.join(root, OUTPUT_DIR);

  const files = await walk(photosRoot);
  if (!fs.existsSync(photosRoot)) {
    log.warn(`[gallery] 找不到 ${PHOTOS_DIR}/ 目录，先创建一个吧。`);
  }

  await fsp.mkdir(outputDir, { recursive: true });
  const cache = force ? {} : await readCache(root);
  const config = await readGalleryConfig(root);

  let regenerated = 0;
  let reused = 0;

  const prepared = await limitMap(files, CONCURRENCY, async (abs) => {
    const rel = toPosix(path.relative(photosRoot, abs));
    try {
      const stat = await fsp.stat(abs);
      const ext = path.extname(abs);
      const stem = path.basename(abs, ext);
      const meta = config[rel] ?? {};

      const { yearDir, locationFromPath } = parseLocationInfo(rel);
      const fmDate = parseDateParts(meta.date);
      const exifDate = await readExifDate(abs);
      const nameDate = dateFromFileName(path.basename(abs, ext));

      // 显式 date > 目录年份 > EXIF 年份 > 文件名里的日期 > 文件时间
      const year = fmDate?.year
        ?? yearDir
        ?? exifDate?.year
        ?? nameDate?.year
        ?? new Date(stat.mtimeMs).getFullYear();

      let exact = null;
      if (fmDate?.month && fmDate?.day) {
        exact = fmDate;
      } else if (exifDate?.month && exifDate?.day && Number(exifDate.year) === Number(year)) {
        // EXIF 只在年份对得上时采用，避免与目录年份打架
        exact = exifDate;
      } else if (nameDate?.month && nameDate?.day && Number(nameDate.year) === Number(year)) {
        exact = nameDate;
      }

      const date = partsToDate(exact) ?? String(year);
      const takenAt = partsToDate(exact) ?? `${year}-01-01`;
      const title = meta.title || stem;
      const location = meta.location || locationFromPath;
      const desc = (meta.desc ?? '').trim();

      // ---- 图片产物（按内容哈希缓存）----
      const previous = cache[rel];
      const hash = !force && previous && previous.size === stat.size && previous.mtimeMs === stat.mtimeMs
        ? previous.hash
        : await hashFile(abs);

      const thumbName = `${hash}.thumb.webp`;
      const largeName = `${hash}.large.webp`;
      const thumbPath = path.join(outputDir, thumbName);
      const largePath = path.join(outputDir, largeName);

      const cacheHit = !force
        && previous?.hash === hash
        && fs.existsSync(thumbPath)
        && fs.existsSync(largePath);

      let { width, height, blurHash } = cacheHit
        ? previous
        : await imageSize(abs).then(async (size) => ({
          ...size,
          blurHash: await makeBlurHash(abs),
        }));

      if (!cacheHit) {
        await renderVariants(abs, { thumbPath, largePath });
        regenerated += 1;
        if (regenerated % 10 === 0) log.info(`[gallery] 已处理 ${regenerated} 张…`);
      } else {
        reused += 1;
      }

      return {
        rel,
        entry: {
          id: hash,
          file: rel,
          title,
          desc,
          location,
          date,
          year: String(year),
          takenAt,
          width,
          height,
          blurHash,
          thumb: `/generated/${thumbName}`,
          large: `/generated/${largeName}`,
        },
        cacheItem: {
          hash, size: stat.size, mtimeMs: stat.mtimeMs, width, height, blurHash,
        },
      };
    } catch (error) {
      log.warn(`[gallery] 跳过 ${rel}：${error.message}`);
      return null;
    }
  });

  const photos = prepared.filter(Boolean);
  const nextCache = Object.fromEntries(photos.map((item) => [item.rel, item.cacheItem]));

  // 配置只保留还存在的照片，顺手清掉指向已删除文件的条目
  const nextConfig = {};
  for (const item of photos) {
    if (config[item.rel]) nextConfig[item.rel] = config[item.rel];
  }
  if (await writeGalleryConfig(root, nextConfig)) {
    log.info(`[gallery] 已同步 ${CONFIG_PATH}`);
  }

  // 清理不再被引用的产物
  const used = new Set(photos.flatMap((item) => [path.basename(item.entry.thumb), path.basename(item.entry.large)]));
  for (const name of await fsp.readdir(outputDir)) {
    if (!name.endsWith('.webp') || used.has(name)) continue;
    await fsp.rm(path.join(outputDir, name), { force: true });
  }

  const manifest = {
    title: '一些晴朗的日子',
    generatedAt: new Date().toISOString(),
    count: photos.length,
    photos: photos
      .map((item) => item.entry)
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.file.localeCompare(b.file)),
  };

  await fsp.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fsp.mkdir(path.join(root, path.dirname(CACHE_PATH)), { recursive: true });
  await fsp.writeFile(path.join(root, CACHE_PATH), `${JSON.stringify(nextCache, null, 2)}\n`, 'utf8');

  log.info(`[gallery] ${photos.length} 张照片（新处理 ${regenerated}，复用 ${reused}）`);
  return manifest;
}

/** 读取已生成的 manifest（供 Vite 插件使用） */
export function readManifest(root = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(root, MANIFEST_PATH), 'utf8'));
}

/* -------------------------------------------------------------- 新增照片 */

const ILLEGAL_FILENAME = /[<>:"/\\|?*\p{Cc}]/gu;
const RESERVED_FILENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** 把任意标题变成安全的文件 / 目录名 */
function safeFileName(raw, fallback = 'photo') {
  let name = String(raw ?? '')
    .replace(ILLEGAL_FILENAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (!name) name = fallback;
  if (RESERVED_FILENAME.test(name)) name = `_${name}`;
  return name;
}

/** 文件名里的日期，例如 20240224181350 / 2024-02-24 / IMG_20240224_1813 */
function dateFromFileName(name) {
  const match = /(20\d{2})[-_. ]?(\d{2})[-_. ]?(\d{2})/.exec(String(name ?? ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * 把一张照片写进 photos/，用户填过的文案写进 photos/gallery.json。
 * @param {{ root?: string, fileName: string, buffer: Buffer, meta?: object }} options
 * @returns {Promise<{ file: string, title: string, location: string, date: string, savedMeta: boolean }>}
 */
export async function addPhoto(options) {
  const {
    root = process.cwd(), fileName, buffer, meta = {},
  } = options;

  const ext = path.extname(String(fileName ?? '')).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) throw new Error(`不支持的格式：${ext || '未知（只收 jpg / png / webp / avif）'}`);
  if (!buffer?.length) throw new Error('文件是空的');

  // 先确认它真的是张能解出来的图，避免坏文件进了仓库才在构建时报错
  try {
    await sharp(buffer).metadata();
  } catch {
    throw new Error('这个文件不是能识别的图片');
  }
  const exifParts = await readExifDate(buffer);
  const parts = parseDateParts(meta.date) ?? exifParts ?? dateFromFileName(fileName);
  const year = String(parts?.year ?? new Date().getFullYear());

  const userTitle = String(meta.title ?? '').trim();
  const title = userTitle || path.basename(fileName, ext);
  const location = String(meta.location ?? '').trim();
  const desc = String(meta.desc ?? '').trim();
  const date = partsToDate(parseDateParts(meta.date)) ?? '';

  const dir = path.join(
    root,
    PHOTOS_DIR,
    safeFileName(year, 'unknown'),
    ...(location ? [safeFileName(location, '未标注')] : []),
  );
  await fsp.mkdir(dir, { recursive: true });

  const stem = safeFileName(title);
  let target = path.join(dir, `${stem}${ext}`);
  let counter = 2;
  while (fs.existsSync(target)) {
    target = path.join(dir, `${stem}-${counter}${ext}`);
    counter += 1;
  }
  await fsp.writeFile(target, buffer);

  const rel = toPosix(path.relative(path.join(root, PHOTOS_DIR), target));

  // 只有用户真的填了东西才记进配置文件，纯拖拽进来的图不需要任何额外配置
  const entry = normalizeConfigEntry({
    title: userTitle,
    location,
    date,
    desc,
  });
  if (entry) {
    const config = await readGalleryConfig(root);
    config[rel] = entry;
    await writeGalleryConfig(root, config);
  }

  return {
    file: rel,
    title,
    location,
    date: date || (exifParts ? partsToDate(exifParts) : '') || year,
    savedMeta: Boolean(entry),
  };
}
