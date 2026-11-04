<template>
  <div class="
    h-100vh w-100vw fixed bg-[rgba(47,14,59,0.62)] flex justify-end top-0 left-0
    backdrop-blur-40 saturate-120
  " :class="{ 'flex-col': windowWidth < 1024 }" v-if="modelValue">
    <div class="flex justify-center relative grow-1 overflow-hidden">
      <div class="btn absolute left-4 top-4" @click="emits('update:modelValue', false)">
        <i class="i-mdi-close" />
      </div>

      <div class="btn absolute right-4 top-4" @click="folded = !folded" v-if="windowWidth > 1024">
        <i :class="folded ? 'i-mdi-chevron-double-left' : 'i-mdi-chevron-double-right'" />
      </div>
      <div class="btn absolute left-4 bottom-4" @click="folded = !folded" v-else>
        <i :class="folded ? 'i-mdi-chevron-double-up' : 'i-mdi-chevron-double-down'" />
      </div>

      <div class="btn absolute left-4 top-50% translate-y--50%" @click="emits('lastImage')"
        v-show="current > 0">
        <i class="i-mdi-chevron-left" />
      </div>
      <div class="btn absolute right-4 top-50% translate-y--50%" @click="emits('nextImage')"
        v-show="current < total - 1">
        <i class="i-mdi-chevron-right" />
      </div>

      <div class="relative h-100% w-100%">
        <canvas ref="skeletonRef" class="absolute inset-0 h-100% w-100% block object-contain"
          width="32" height="32" />
        <img :src="photo.large" :alt="photo.title" decoding="async"
          class="relative h-100% w-100% block object-contain opacity-0 transition-opacity duration-300"
          :class="{ 'opacity-100': loaded }" @load="loaded = true" />
      </div>
    </div>

    <Transition :enter-active-class="metaEnterActiveClass" :leave-active-class="metaLeaveActiveClass">
      <aside class="
        meta-panel box-border shrink-0 lg:w-30% pa-8 backdrop-blur-40 saturate-200
        bg-[rgba(255,255,255,.6)] c-[rgba(0,0,0,.85)] important-animate-duration-170
        relative z-20
      " v-if="!folded">
        <div class="fw-bold text-3xl lg:text-4xl">{{ photo.title || '无题' }}</div>
        <div class="mt-6 flex flex-wrap gap-y-2 lg:text-lg">
          <span class="mr-6 flex items-center" v-if="photo.location">
            <i class="i-mdi-map-marker inline-block mr-1" />
            {{ photo.location }}
          </span>
          <span class="flex items-center" v-if="photo.date">
            <i class="i-mdi-clock inline-block mr-1" />
            {{ photo.date }}
          </span>
        </div>
        <div class="text-justify tracking-.05rem lh-150% lg:text-lg mt-4 whitespace-pre-line">
          {{ photo.desc || '无描述 :/' }}
        </div>
        <a class="
          mt-8 inline-flex items-center text-sm c-gray-600 hover:c-black
          transition-colors duration-170
        " :href="originUrl" target="_blank" rel="noopener noreferrer">
          <i class="i-mdi-image-outline mr-1" />
          在 GitHub 查看原图
          <i class="i-mdi-open-in-new ml-1" />
        </a>
      </aside>
    </Transition>
  </div>
</template>

<script setup>
import { decode } from 'blurhash';
import { computed, ref, watchEffect } from 'vue';
import { useWindowSize } from '@vueuse/core';
import config from '../gallery.config.js';

const props = defineProps({
  photo: { type: Object, required: true },
  current: Number,
  total: Number,
  modelValue: Boolean,
});
const emits = defineEmits(['lastImage', 'nextImage', 'update:modelValue']);

const { width: windowWidth } = useWindowSize();
const folded = ref(false);
const loaded = ref(false);
const skeletonRef = ref(null);
const metaEnterActiveClass = ref('');
const metaLeaveActiveClass = ref('');

const originUrl = computed(
  () => `${config.repo}/blob/${config.defaultBranch}/photos/${encodeURI(props.photo.file)}`,
);

watchEffect(() => {
  if (!props.modelValue || !skeletonRef.value) return;
  const { width, height } = props.photo;
  const canvas = skeletonRef.value;
  canvas.width = 32;
  canvas.height = Math.max(1, Math.round((height / width) * 32));
  try {
    const pixels = decode(props.photo.blurHash, canvas.width, canvas.height);
    const context = canvas.getContext('2d');
    const imageData = context.createImageData(canvas.width, canvas.height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
  } catch {
    /* 忽略占位图绘制失败 */
  }
});

watchEffect(() => {
  if (windowWidth.value > 1024) {
    metaEnterActiveClass.value = 'animate__animated animate__slideInRight';
    metaLeaveActiveClass.value = 'animate__animated animate__slideOutRight';
  } else {
    metaEnterActiveClass.value = 'animate__animated animate__slideInUp';
    metaLeaveActiveClass.value = 'animate__animated animate__slideOutDown';
  }
});
</script>

<style scoped>
@import url('animate.css');

.btn {
  --at-apply: pa-2 rd-50% cursor-pointer backdrop-blur-20 saturate-180 lg:pa-3 z-10;
  --at-apply: "c-[rgba(255,255,255,.85)] bg-[rgba(145,116,155,.6)]";
  --at-apply: "hover:bg-[rgba(145,116,155,.8)] active:bg-[rgba(145,116,155,1)]";
}

.btn i {
  --at-apply: block text-xl;
}

/* 窄屏时信息栏是底部抽屉，长文案要能自己滚 */
@media (max-width: 1023px) {
  .meta-panel {
    max-height: 60vh;
    overflow-y: auto;
  }
}
</style>
