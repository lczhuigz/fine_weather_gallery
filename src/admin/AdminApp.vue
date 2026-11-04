<template>
  <main class="min-h-100vh bg-#f2f3f8 dark:bg-#131130 pa-4 sm:pa-8">
    <div class="mx-auto max-w-4xl">
      <header class="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl fw-bold c-slate-800 dark:c-gray-100">添加照片</h1>
          <p class="mt-1 text-xs c-gray-500 dark:c-gray-400">
            拖进来就行：年份从 EXIF 读，地点自动建目录，文案想写再写。
          </p>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <button class="ghost c-gray-500 hover:c-gray-800 dark:hover:c-gray-200 transition-colors" title="切换深浅色" @click="isDark = !isDark">
            <span class="block h-5 w-5" :class="isDark ? 'i-mdi:weather-night' : 'i-mdi:weather-sunny'" />
          </button>
          <a class="c-gray-600 dark:c-gray-300 hover:c-black dark:hover:c-white" href="/">← 回到相册</a>
        </div>
      </header>

      <div v-if="!isDev" class="mb-5 rd-lg b-1 b-solid b-amber-300 bg-amber-50 px-4 py-3 text-sm c-amber-800">
        这个页面只在本地 <code class="px-1 rd bg-amber-100">pnpm dev</code> 下可用，线上环境没有写文件的后端。
      </div>

      <div class="
        dropzone rd-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors
      " :class="dragging
        ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20'
        : 'border-gray-300 dark:border-gray-600 hover:border-violet-300 dark:hover:border-violet-700'"
        @click="pickFiles" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop">
        <input ref="inputRef" type="file" accept="image/*" multiple class="hidden" @change="onPick" />
        <div class="mx-auto text-3xl c-gray-400" :class="dragging ? 'i-mdi-download' : 'i-mdi-camera-plus-outline'" />
        <div class="mt-3 text-sm c-gray-600 dark:c-gray-300">
          把照片拖到这里，或点击选择
        </div>
        <div class="mt-1 text-xs c-gray-400">jpg / png / webp / avif，可以一次选多张</div>
      </div>

      <ul class="mt-6 flex flex-col gap-3">
        <li v-for="item in items" :key="item.id"
          class="flex flex-col gap-4 rd-xl bg-white p-3 shadow-sm sm:flex-row dark:bg-#1c1938">
          <div class="relative shrink-0">
            <img :src="item.preview" :alt="item.file.name"
              class="h-36 w-full object-cover rd-lg sm:w-36" />
            <button class="
              absolute right-1 top-1 h-6 w-6 flex items-center justify-center rd-full b-0
              bg-black/55 text-white text-xs hover:bg-black/75
            " title="移除" @click="removeItem(item.id)">
              <i class="i-mdi-close" />
            </button>
          </div>

          <div class="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
            <label class="flex flex-col gap-1">
              <span class="text-xs c-gray-500 dark:c-gray-400">标题</span>
              <input v-model="item.title" class="field" :placeholder="item.defaultTitle" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs c-gray-500 dark:c-gray-400">地点</span>
              <input v-model="item.location" class="field" list="known-locations" placeholder="可留空" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs c-gray-500 dark:c-gray-400">日期</span>
              <input v-model="item.date" type="date" class="field" />
              <span class="flex h-4 items-center text-[11px] c-gray-400">
                <button v-if="item.date" type="button" class="ghost hover:c-violet-600 dark:hover:c-violet-400"
                  @click.prevent="item.date = ''">
                  清除，改用自动日期
                </button>
                <button v-else-if="item.dateHint" type="button" class="ghost hover:c-violet-600 dark:hover:c-violet-400"
                  title="点一下填入这个日期" @click.prevent="item.date = item.dateHint">
                  自动：{{ item.dateHint }}
                </button>
                <span v-else>留空则用 EXIF / 文件名</span>
              </span>
            </label>
            <label class="flex flex-col gap-1 sm:col-span-3">
              <span class="text-xs c-gray-500 dark:c-gray-400">
                文案
                <span class="c-gray-400">（留空就只有标题）</span>
              </span>
              <textarea v-model="item.desc" class="field resize-y" rows="2" placeholder="这张照片背后的故事…" />
            </label>
            <p v-if="item.error" class="text-xs c-red-600 sm:col-span-3">
              上传失败：{{ item.error }}
            </p>
          </div>
        </li>
      </ul>

      <datalist id="known-locations">
        <option v-for="location in knownLocations" :key="location" :value="location" />
      </datalist>

      <div class="
        sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 py-4
        bg-[rgba(242,243,248,.92)] backdrop-blur-6 dark:bg-[rgba(19,17,48,.92)]
      ">
        <button :disabled="!items.length || saving" class="
          rd-lg px-5 py-2 text-sm c-white transition-colors
          disabled:cursor-not-allowed disabled:opacity-40
          bg-violet-700 hover:bg-violet-600 active:bg-violet-800
        " @click="save">
          <template v-if="saving">
            保存中 {{ progress.done }}/{{ progress.total }}…
          </template>
          <template v-else>
            {{ items.length ? `保存 ${items.length} 张` : '保存' }}
          </template>
        </button>
        <button v-if="savedTotal && !saving" class="ghost text-xs c-violet-700 dark:c-violet-300 hover:underline"
          @click="goGallery">
          回到相册看效果 →
        </button>
        <span class="text-xs" :class="error ? 'c-red-600' : 'c-gray-500 dark:c-gray-400'">{{ message }}</span>
      </div>
    </div>
  </main>
</template>

<script setup>
import exifr from 'exifr';
import {
  computed, onBeforeUnmount, ref,
} from 'vue';
import { useDark } from '@vueuse/core';
import galleryData from 'virtual:gallery';

const isDev = import.meta.env.DEV;
const isDark = useDark();
const inputRef = ref(null);
const items = ref([]);
const dragging = ref(false);
const saving = ref(false);
const message = ref('');
const error = ref(false);
const progress = ref({ done: 0, total: 0 });
const savedTotal = ref(0);

let seq = 0;

const knownLocations = computed(
  () => [...new Set(galleryData.photos.map((photo) => photo.location).filter(Boolean))],
);

const pad = (value) => String(value).padStart(2, '0');

async function exifDateHint(file) {
  try {
    const parsed = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
    });
    const date = parsed?.DateTimeOriginal ?? parsed?.CreateDate ?? parsed?.ModifyDate;
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
  } catch {
    /* 没有 EXIF 就留空 */
  }
  return '';
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  if (!files.length) {
    error.value = true;
    message.value = '这些都还不是图片文件';
    return;
  }
  error.value = false;
  message.value = '';

  for (const file of files) {
    const duplicated = items.value.some(
      (item) => item.file.name === file.name && item.file.size === file.size,
    );
    if (duplicated) continue;

    // 先把 EXIF 提示算好再入列，直接改已入列的对象不会触发视图更新
    const dateHint = await exifDateHint(file);
    seq += 1;
    items.value.push({
      id: seq,
      file,
      preview: URL.createObjectURL(file),
      title: '',
      location: '',
      date: '',
      desc: '',
      defaultTitle: file.name.replace(/\.[^.]+$/, ''),
      dateHint,
    });
  }
}

function onDrop(event) {
  dragging.value = false;
  addFiles(event.dataTransfer?.files ?? []);
}

function onPick(event) {
  addFiles(event.target.files ?? []);
  event.target.value = '';
}

function pickFiles() {
  inputRef.value?.click();
}

function goGallery() {
  window.location.href = '/';
}

function removeItem(id) {
  const index = items.value.findIndex((item) => item.id === id);
  if (index === -1) return;
  URL.revokeObjectURL(items.value[index].preview);
  items.value.splice(index, 1);
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

async function save() {
  if (!items.value.length || saving.value) return;
  saving.value = true;
  error.value = false;
  message.value = '';
  savedTotal.value = 0;

  // 失败过的条目留在列表里，再点一次就是重试
  const pending = [...items.value];
  progress.value = { done: 0, total: pending.length };
  let succeeded = 0;

  for (const item of pending) {
    item.error = '';
    try {
      const data = await toBase64(item.file);
      const response = await fetch('/__gallery/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: item.file.name,
          data,
          meta: {
            title: item.title,
            location: item.location,
            date: item.date,
            desc: item.desc,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      item.status = 'saved';
      succeeded += 1;
    } catch (err) {
      item.status = 'failed';
      item.error = err.message || '上传失败';
    } finally {
      progress.value.done += 1;
    }
  }

  // 成功的移出列表，失败的留下
  items.value
    .filter((item) => item.status === 'saved')
    .forEach((item) => URL.revokeObjectURL(item.preview));
  items.value = items.value.filter((item) => item.status !== 'saved');

  if (!succeeded) {
    error.value = true;
    message.value = '一张都没成功，下面每张都有具体原因。';
    saving.value = false;
    return;
  }

  // 一批传完再统一压图，避免每张都重建一次
  message.value = `已写入 ${succeeded} 张，正在生成缩略图…`;
  try {
    const response = await fetch('/__gallery/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
    savedTotal.value = succeeded;
    message.value = items.value.length
      ? `${succeeded} 张已保存，还有 ${items.value.length} 张失败，可以重试。`
      : `${succeeded} 张已保存，共 ${result.count} 张。`;
  } catch (err) {
    error.value = true;
    message.value = `照片已写入 photos/，但生成缩略图失败：${err.message}。在终端重跑 pnpm gallery 即可。`;
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(() => {
  items.value.forEach((item) => URL.revokeObjectURL(item.preview));
});
</script>

<style scoped>
/* 项目里没有全局 reset，按钮会带浏览器的默认边框和字体 */
button {
  font: inherit;
  color: inherit;
}

.ghost {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.field {
  --at-apply: "box-border w-full px-2.5 py-1.5 rd-md b-1 b-solid b-gray-300 bg-transparent text-sm outline-none";
  --at-apply: "dark:b-gray-600 c-slate-800 dark:c-gray-100 focus:b-violet-400";
  --at-apply: "placeholder:c-gray-400";
  color-scheme: light;
}

/* 原生日期框比文本框高 2px，统一一下，否则同一行底部会错开 */
.field:not(textarea) {
  height: 2.25rem;
}

:global(.dark) .field {
  color-scheme: dark;
}
</style>
