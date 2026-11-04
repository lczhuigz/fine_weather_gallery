/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import { presetUno, presetIcons, transformerVariantGroup } from 'unocss';
import { resolve } from 'path';
import transformerDirectives from '@unocss/transformer-directives';
import gallery from './scripts/vite-plugin-gallery.mjs';
import galleryAdmin from './scripts/vite-plugin-admin.mjs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    gallery(),
    galleryAdmin(),
    vue(),
    UnoCSS({
      presets: [presetIcons(), presetUno()],
      transformers: [transformerDirectives(), transformerVariantGroup()],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    // 生成的图和缓存不参与热更新监听，避免自己触发自己
    watch: {
      ignored: ['**/public/generated/**', '**/.cache/**', '**/dist/**', '**/node_modules/**'],
    },
  },
});
