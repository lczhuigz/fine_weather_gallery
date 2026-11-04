<template>
  <main class="pa-4 dark:bg-#131130">
    <div class="h-100vh w-100vw dots fixed pointer-events-none" :class="{ dark: isDark }" />

    <section v-if="photos.length" class="
      columns-1 sm:columns-2 md:columns-3 xl:columns-4 2xl:columns-5
      gap-x-4
    ">
      <ImageCard v-for="(photo, index) in visible" :key="photo.file" :photo="photo"
        @click="openDetail(index)" />
    </section>

    <div v-else class="h-60vh flex flex-col items-center justify-center text-center c-gray-500">
      <div class="text-2xl mb-3">相册还是空的</div>
      <div class="text-sm lh-200%">
        把照片放进
        <code class="px-1.5 py-0.5 rd bg-gray-200/70 dark:bg-gray-700/60">photos/年份/地点/标题.jpg</code>
        <br />
        再跑一次 <code class="px-1.5 py-0.5 rd bg-gray-200/70 dark:bg-gray-700/60">pnpm gallery</code> 就行。
      </div>
    </div>

    <div class="flex my-18 items-center flex-col select-none text-xs">
      <div v-if="reactionsEnabled && reactionsReady">
        <component :is="EmojiReaction" :reactor="reactor" :react="react" :unreact="unreact"
          :getReactions="getReactions" :dark="isDark" :emojis="reactions.emojis" />
      </div>
      <div class="text-gray-400 mb-3 mt-2.5">
        {{ visible.length }}<span class="mx-.5">/</span>{{ photos.length }}
      </div>
      <div class="
        c-gray-600 dark:c-gray-200 cursor-pointer
        rd-2 py-1 px-2 simple-btn
      " @click="loadMore" v-if="photos.length > loaded">
        More
      </div>
      <div class="c-gray-600 dark:c-gray-200 py-1" v-else-if="photos.length">
        No More
      </div>
    </div>

    <footer class="flex flex-col items-center">
      <div class="text-xl c-slate-800 flex items-center gap2">
        <div class="footer-btn simple-btn" @click="isDark = !isDark">
          <div :class="isDark ? 'i-mdi:weather-night' : 'i-mdi:weather-sunny'" />
        </div>
        <div class="footer-btn simple-btn" @click="jumpTo(config.repo)">
          <div class="i-mdi-github" />
        </div>
        <div class="footer-btn simple-btn" @click="updateOrdering">
          <div :class="ordering === 'random' ?
            'i-mdi-shuffle' :
            ordering === 'asc' ?
              'i-mdi-sort-clock-ascending' : 'i-mdi-sort-clock-descending'
            " />
        </div>
        <div class="footer-btn simple-btn relative" ref="introRef" v-if="width > 640">
          <Transition>
            <div v-if="isIntroBtnHover" class="
                bg-white text-gray-800 text-justify absolute lh-150%
                bottom-110% p2 rounded-lg text-xs w-62 shadow-lg
                dark:(bg-gray-800 text-gray-200 shadow-gray-900)
            ">
              {{ config.intro }}
            </div>
          </Transition>
          <div class="i-mdi:information-outline" />
        </div>
      </div>

      <div class="text-xs c-gray-600 dark:c-gray-200 mt-3">
        <div class="text-center">
          <span>&copy; {{ new Date().getFullYear() }}</span>
          <span class="
            ml-2 inline-flex c-gray-600 items-center cursor-pointer b-1 b-solid b-transparent
            hover:b-b-gray-600
            dark:c-gray-200 dark:hover:b-b-gray-200
          " @click="jumpTo(config.author.url)">
            <span>{{ config.author.name }}</span>
            <i class="i-mdi-open-in-new ml-1" />
          </span>
        </div>
        <div class="text-gray-400 mt-1">
          共 {{ photos.length }} 张 · 最近一张 {{ latestDate }}
        </div>
      </div>
    </footer>

    <ImageDetail v-if="activePhoto" :key="activePhoto.file" v-model="detailOpen" :photo="activePhoto"
      :current="activeIndex" :total="photos.length"
      @lastImage="openDetail(activeIndex - 1)"
      @nextImage="openDetail(activeIndex + 1)" />
  </main>
</template>

<script setup>
import { EmojiReaction } from 'emoji-reaction';
import {
  computed, onMounted, ref, watch, watchEffect,
} from 'vue';
import {
  useDark, useEventListener, useWindowSize, useLocalStorage, useElementHover,
} from '@vueuse/core';
import galleryData from 'virtual:gallery';
import ImageCard from './ImageCard.vue';
import ImageDetail from './ImageDetail.vue';
import config from '../gallery.config.js';

const PAGE_SIZE = config.pageSize ?? 20;
const reactions = config.reactions;
const reactionsEnabled = Boolean(reactions.apiBase);

const ordering = useLocalStorage('fw-ordering', 'asc'); // 'asc' | 'desc' | 'random'
const isDark = useDark();
const introRef = ref();
const { width } = useWindowSize();
const isIntroBtnHover = useElementHover(introRef);

const photos = ref([]);
const visible = ref([]);
const loaded = ref(0);
const detailOpen = ref(false);
const activeIndex = ref(-1);
const reactor = ref('');
const reactionsReady = ref(false);
const emojiReactions = ref([]);

const activePhoto = computed(() => photos.value[activeIndex.value] ?? null);
// 取生成时的原始顺序（按拍摄时间升序），不受当前排序方式影响
const latestDate = computed(() => galleryData.photos.at(-1)?.date ?? '—');

function sortPhotos(list) {
  if (ordering.value === 'random') {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  const factor = ordering.value === 'desc' ? -1 : 1;
  return list.sort(
    (a, b) => factor * (a.takenAt.localeCompare(b.takenAt) || a.title.localeCompare(b.title)),
  );
}

function loadMore() {
  const next = photos.value.slice(loaded.value, loaded.value + PAGE_SIZE);
  visible.value.push(...next);
  loaded.value += next.length;
}

function applyOrdering() {
  photos.value = sortPhotos([...galleryData.photos]);
  visible.value = [];
  loaded.value = 0;
  loadMore();
}

function updateOrdering() {
  const next = { asc: 'desc', desc: 'random', random: 'asc' };
  ordering.value = next[ordering.value] ?? 'asc';
  window.scrollTo({ top: 0 });
}

function openDetail(index) {
  if (index < 0 || index >= photos.value.length) return;
  activeIndex.value = index;
  detailOpen.value = true;
}

function jumpTo(url) {
  window.open(url, '_blank', 'noopener');
}

/* --------------------------------------------------------------- 表情回应 */

function react(reaction) {
  return fetch(`${reactions.apiBase}/reactions`, {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reaction, reactor: reactor.value, symbol: reactions.symbol }),
  });
}

function unreact(reaction) {
  const target = emojiReactions.value.find(
    (item) => item.reaction === reaction && item.reactors.includes(reactor.value),
  );
  if (!target) return Promise.resolve();
  return fetch(`${reactions.apiBase}/reactions`, {
    method: 'delete',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reaction, reactor: reactor.value, symbol: reactions.symbol }),
  });
}

async function getReactions() {
  const response = await fetch(
    `${reactions.apiBase}/reactions?symbol=${reactions.symbol}`,
    { method: 'get' },
  );
  emojiReactions.value = (await response.json()) ?? [];
  return emojiReactions.value;
}

/* -------------------------------------------------------------------- 交互 */

function keypressListener(event) {
  if (!detailOpen.value) return;
  if (event.key === 'Escape') {
    detailOpen.value = false;
  } else if (event.key === 'ArrowLeft') {
    openDetail(activeIndex.value - 1);
  } else if (event.key === 'ArrowRight') {
    openDetail(activeIndex.value + 1);
  }
}

watch(ordering, applyOrdering);

watchEffect(() => {
  document.body.style.overflow = detailOpen.value ? 'hidden' : 'auto';
});

onMounted(async () => {
  applyOrdering();
  useEventListener(document, 'keydown', keypressListener);

  if (!reactionsEnabled) return;
  try {
    const { default: FingerprintJS } = await import('@fingerprintjs/fingerprintjs');
    const agent = await FingerprintJS.load();
    reactor.value = (await agent.get()).visitorId;
    reactionsReady.value = true;
  } catch {
    /* 取不到访客标识就不渲染表情组件，不影响看图 */
  }
});
</script>

<style scoped>
.simple-btn {
  --at-apply: hover:bg-#4c1d9545 active:bg-#4c1d9562 bg-#4c1d9525;
  --at-apply: dark:bg-violet-900 dark:c-gray-200 dark:hover:bg-violet-800 dark:active:bg-violet-700;
}

.footer-btn {
  --at-apply: backdrop-blur-2 saturate-120% pa-1 rd-50% cursor-pointer;
}

.dots {
  background: url("data:image/svg+xml;utf8, <svg width='16' height='16' fill='none' xmlns='http://www.w3.org/2000/svg'><rect fill='rgba(25, 33, 38, 0.2)' x='7' y='7' width='2' height='2'></rect></svg>") fixed;
}

.dots.dark {
  background: url("data:image/svg+xml;utf8, <svg width='16' height='16' fill='none' xmlns='http://www.w3.org/2000/svg'><rect fill='rgba(255, 255, 255, 0.17)' x='7' y='7' width='2' height='2'></rect></svg>") fixed;
}
</style>
