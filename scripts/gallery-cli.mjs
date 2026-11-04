/**
 * 相册命令行：
 *   node scripts/gallery-cli.mjs           # 增量生成（默认）
 *   node scripts/gallery-cli.mjs --force   # 全部重新处理
 *   node scripts/gallery-cli.mjs --clean   # 清空生成产物
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildGallery, OUTPUT_DIR } from './gallery-core.mjs';

const args = new Set(process.argv.slice(2));

if (args.has('--clean')) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.rmSync(path.join('.cache', 'gallery-images.json'), { force: true });
  console.info('[gallery] 已清空生成产物');
} else {
  await buildGallery({ force: args.has('--force') });
}
