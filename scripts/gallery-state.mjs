/**
 * 两个 Vite 插件（相册监听 / 管理页接口）之间共享的一点点状态。
 * 管理页正在写文件时，监听插件不要抢着重构和刷新页面。
 */
export const galleryState = {
  adminBusy: false,
  lastAdminWrite: 0,
  // 管理页批量上传的时间窗口：这段时间内不重建、不刷新页面，等 finalize 统一处理
  batchUntil: 0,
};

export const GALLERY_VIRTUAL_ID = 'virtual:gallery';
export const GALLERY_RESOLVED_ID = `\0${GALLERY_VIRTUAL_ID}`;
