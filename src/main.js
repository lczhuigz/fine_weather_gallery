import { createApp } from 'vue';
import App from './App.vue';
import config from './gallery.config.js';
import 'virtual:uno.css';
import './style.css';

// /admin 是本地用的上传页面：只在 dev 下存在，生产构建里连这个 chunk 都不会生成
const isAdmin = import.meta.env.DEV
  && window.location.pathname.replace(/\/+$/, '') === '/admin';

if (isAdmin) {
  document.title = `添加照片 · ${config.title}`;
  import('./admin/AdminApp.vue').then(({ default: AdminApp }) => {
    createApp(AdminApp).mount('#app');
  });
} else {
  document.title = config.title;
  createApp(App).mount('#app');
}
