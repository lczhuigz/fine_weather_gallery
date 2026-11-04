/**
 * 站点级配置：只有「站点本身」的文案写在这里。
 * 每张照片的标题 / 地点 / 描述请写在照片旁边的同名 .md 里（见 README）。
 */
export default {
  title: '一些晴朗的日子',
  intro:
    '由于有若干个能拍照的设备，再加上时间会公平地杀死一切，我每年都会拍出几张回看时感慨万千的照片。'
    + '但由于时间与地域的关系，这些照片往往要么丢失，要么被随意塞在网盘的某处。'
    + '于是，我决心花一些精力把它们维护起来。'
    + '而这些图片拍时多是好天气，所以干脆统称这些照片为「一些晴朗的日子」。',

  author: {
    name: 'lczhuigz',
    url: 'https://me.lczhuigz.cn',
  },

  /** 用来生成 GitHub 链接（页脚 + 详情页「查看原图」） */
  repo: 'https://github.com/lczhuigz/fine_weather_gallery',
  defaultBranch: 'main',

  /** 首屏一次性渲染多少张，点 More 继续加载 */
  pageSize: 20,

  reactions: {
    /**
     * 表情回应的后端地址，可选。留空 = 不显示表情组件，也不加载 fingerprint。
     * 需要实现 GET/POST/DELETE `${apiBase}/reactions`，见 README。
     */
    apiBase: (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, ''),
    symbol: 'fw',
    emojis: ['👍', '🎉', '❤️', '🚀', '👀', '🤯', '😕', '😏', '🙃', '😄', '🔥', '🌈', '📸', '💖'],
  },
};
