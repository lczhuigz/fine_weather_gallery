/**
 * 只在 `pnpm dev` 下挂载的本地接口：
 *   POST /__gallery/photos    单张上传（写文件 + 记进 gallery.json，不重建）
 *   POST /__gallery/finalize  一批传完之后统一重建（生成缩略图 + 刷新模块）
 *
 * 拆成两步是为了支持几十张一起传：逐张请求不会撑爆请求体，
 * 重建只在最后做一次，而不是每张都压一遍图。
 *
 * 只用于本机开发：构建产物里没有这些接口。
 */
import { addPhoto, buildGallery } from './gallery-core.mjs';
import { GALLERY_RESOLVED_ID, galleryState } from './gallery-state.mjs';

const MAX_BODY = 64 * 1024 * 1024;
// 只接受本机开发页面的请求，防止别的网站趁 dev 开着时往这里 POST
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
// 一批上传的窗口期，期间不做重建、不刷新页面
const BATCH_WINDOW = 5 * 60 * 1000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('单张照片太大了（base64 后超过 64MB）'));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('上传中断')));
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

/** 统一的入口检查：方法 / Origin / Content-Length */
function guard(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: '只接受 POST' });
    return false;
  }
  const origin = req.headers.origin;
  if (origin && !LOCAL_ORIGIN.test(origin)) {
    sendJson(res, 403, { ok: false, error: '只接受本机开发页面的请求' });
    return false;
  }
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_BODY) {
    req.resume();
    sendJson(res, 413, {
      ok: false,
      error: `单张照片太大了（${(declared / 1024 / 1024).toFixed(0)}MB，上限 48MB）`,
    });
    return false;
  }
  return true;
}

export default function galleryAdminPlugin() {
  return {
    name: 'gallery-admin',
    apply: 'serve',

    configureServer(server) {
      const { root, logger } = server.config;

      // ---- 单张上传：只落盘，不重建 ----
      server.middlewares.use('/__gallery/photos', async (req, res) => {
        if (!guard(req, res)) return;

        galleryState.adminBusy = true;
        galleryState.batchUntil = Date.now() + BATCH_WINDOW;
        try {
          const payload = JSON.parse(await readBody(req));
          const saved = await addPhoto({
            root,
            fileName: payload?.fileName,
            buffer: Buffer.from(String(payload?.data ?? ''), 'base64'),
            meta: payload?.meta ?? {},
          });
          sendJson(res, 200, { ok: true, saved });
        } catch (error) {
          sendJson(res, 400, { ok: false, error: error.message });
        } finally {
          galleryState.adminBusy = false;
          galleryState.lastAdminWrite = Date.now();
        }
      });

      // ---- 一批结束：统一重建 ----
      server.middlewares.use('/__gallery/finalize', async (req, res) => {
        if (!guard(req, res)) return;

        try {
          const manifest = await buildGallery({ root, log: logger });
          const module = server.moduleGraph.getModuleById(GALLERY_RESOLVED_ID);
          if (module) server.moduleGraph.invalidateModule(module);
          logger.info(`[gallery] 管理页保存完成，当前共 ${manifest.count} 张`);
          sendJson(res, 200, { ok: true, count: manifest.count });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error.message });
        } finally {
          galleryState.batchUntil = 0;
          galleryState.lastAdminWrite = Date.now();
        }
      });
    },
  };
}
