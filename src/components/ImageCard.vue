<template>
  <!-- m-0 覆盖 <figure> 的默认 margin，否则每张卡片会左右各缩进 40px -->
  <figure class="group relative m-0 mb-4 break-inside-avoid cursor-pointer transition-170 hover:scale-103">
    <div class="photo-frame relative overflow-hidden rd bg-[rgba(0,0,0,.08)] dark:bg-[rgba(0,0,0,.2)]"
      :style="{ aspectRatio: `${photo.width} / ${photo.height}` }">
      <canvas ref="canvasRef" class="absolute inset-0 h-full w-full" width="32" height="32" />
      <img :src="photo.thumb" :alt="photo.title" loading="lazy" decoding="async"
        class="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500"
        :class="{ 'opacity-100': loaded }" @load="loaded = true" />
    </div>
    <figcaption class="caption absolute inset-0 box-border flex items-end pa-4 rd opacity-0 transition-opacity duration-170">
      <div class="c-white overflow-hidden">
        <div class="text-xl fw-bold">{{ photo.title }}</div>
        <div class="text-sm flex mt-2" v-if="photo.location || photo.date">
          <div v-if="photo.location" class="flex items-center mr-2">
            <i class="i-mdi-map-marker mr-1" />
            {{ photo.location }}
          </div>
          <div v-if="photo.date" class="flex items-center">
            <i class="i-mdi-clock mr-1" />
            {{ photo.date }}
          </div>
        </div>
        <div class="text-sm text-truncate mt-2" v-if="photo.desc" :title="photo.desc">{{ photo.desc }}</div>
      </div>
    </figcaption>
  </figure>
</template>

<script setup>
import { decode } from 'blurhash';
import { onMounted, ref } from 'vue';

const props = defineProps({
  photo: { type: Object, required: true },
});

const loaded = ref(false);
const canvasRef = ref(null);

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas || !props.photo.blurHash) return;
  try {
    const pixels = decode(props.photo.blurHash, 32, 32);
    const context = canvas.getContext('2d');
    const imageData = context.createImageData(32, 32);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
  } catch {
    /* blurhash 解不出来就算了，留个纯色底 */
  }
});
</script>

<style scoped>
.caption {
  background: linear-gradient(to top, rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0));
}

.group:hover .caption {
  opacity: 1;
}

/* 触屏设备没有 hover，常驻显示，并且去掉缩放 */
@media (hover: none) {
  .caption {
    opacity: 1;
  }

  .group:hover {
    transform: none;
  }
}
</style>
