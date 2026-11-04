/**
 * Vite 插件：把 `virtual:gallery` 暴露成相册数据，
 * 并在 dev 模式下监听 photos/ 变化自动重建、刷新页面。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildGallery, PHOTOS_DIR, readManifest,
} from './gallery-core.mjs';
import { GALLERY_RESOLVED_ID, GALLERY_VIRTUAL_ID, galleryState } from './gallery-state.mjs';

const WATCHED_EXTENSION = /\.(jpe?g|png|webp|avif|json)$/i;

export default function galleryPlugin() {
  let manifest = null;
  let root = process.cwd();

  const load = () => {
    // 每次从磁盘读：管理页写完后会失效本模块，读旧的内存副本会拿到过期数据
    try {
      manifest = readManifest(root);
    } catch {
      throw new Error(
        '[gallery] 还没有生成相册数据，请先运行 `pnpm gallery`（或直接 `pnpm dev` / `pnpm build`）。',
      );
    }
    return manifest;
  };

  return {
    name: 'gallery',
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
      try {
        manifest = readManifest(root);
      } catch {
        manifest = null;
      }
    },

    resolveId(id) {
      return id === GALLERY_VIRTUAL_ID ? GALLERY_RESOLVED_ID : null;
    },

    load(id) {
      if (id !== GALLERY_RESOLVED_ID) return null;
      return `export default ${JSON.stringify(load())};`;
    },

    configureServer(server) {
      const photosDir = path.join(root, PHOTOS_DIR);
      if (!fs.existsSync(photosDir)) return;

      server.watcher.add(photosDir);
      let timer = null;

      const schedule = (file) => {
        if (!file.startsWith(photosDir) || !WATCHED_EXTENSION.test(file)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          timer = null;
          // 管理页正在批量写入：它会在最后调 finalize 统一重建，这里别抢着做
          if (
            galleryState.adminBusy
            || Date.now() < galleryState.batchUntil
            || Date.now() - galleryState.lastAdminWrite < 3000
          ) return;
          try {
            manifest = await buildGallery({ root, log: server.config.logger });
            const module = server.moduleGraph.getModuleById(GALLERY_RESOLVED_ID);
            if (module) server.moduleGraph.invalidateModule(module);
            server.ws.send({ type: 'full-reload' });
          } catch (error) {
            server.config.logger.error(`[gallery] 重建失败：${error.message}`);
          }
        }, 350);
      };

      server.watcher
        .on('add', schedule)
        .on('change', schedule)
        .on('unlink', schedule);
    },
  };
}
