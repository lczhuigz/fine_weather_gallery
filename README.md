# 一些晴朗的日子

一个用来存放「回看时感慨万千」的照片墙。Vue 3 + Vite + UnoCSS，部署在 **GitHub + Vercel**。

> **加一张照片 = 放进一个文件夹。** 不用改任何配置，不用手动生成缩略图，不用二次提交。

**环境要求**：Node.js ≥ 20、pnpm 12（`package.json` 里声明了 `packageManager`，用 corepack 会自动切到对应版本）。

## 加一张照片

1. 把照片放到 `photos/<年份>/<地点>/<标题>.<扩展名>`，例如：

   ```
   photos/2024/宿迁/甲辰花火一.jpg
   ```

   文件名就是标题，文件夹就是年份和地点。文件名随便取，中文、空格、`Hello, SH.jpg` 都行。

2. 想写点文案，就打开 `photos/gallery.json`，按路径加一条（不想写的话第 1 步就结束了）：

   ```json
   {
     "2024/宿迁/甲辰花火一.jpg": {
       "title": "甲辰花火一",
       "location": "宿迁，江苏",
       "date": "2024-02-09",
       "desc": "随着年纪上长，抢着和发小付款成了每年传统。这年的结果是，烟花越抢，买越多。"
     }
   }
   ```

   四个字段全都可以省略：不写 `title` 用文件名，不写 `location` 用目录名，不写 `date` 用 EXIF。

3. `git add photos && git commit && git push`。Vercel 自动构建、自动上线。

本地想看效果：`pnpm dev`（会先把新照片处理一遍）。

## 更省事：用管理页面加图

不想碰目录、也不想手改 JSON 的话：

```bash
pnpm dev
```

打开 <http://localhost:5173/admin>，把照片拖进去，标题 / 地点 / 文案填在输入框里（日期会从 EXIF 自动读出并提示），点「保存」。

它会自己完成这些事：

1. 按 EXIF 日期建好 `photos/<年份>/` 目录；
2. 填了地点就再建一层 `photos/<年份>/<地点>/`；
3. 把图片按标题命名放进去（重名自动加 `-2`、`-3`）；
4. **只有你填了东西才写进 `photos/gallery.json`** —— 纯拖进去的图不会多出条目；
5. 保存完**停留在当前页**，可以接着拖下一批；想看图再点「回到相册看效果」。

一次选几十张也没问题：页面会**逐张上传**（按钮上显示 `保存中 12/35…`），全部传完后只生成一次缩略图 ——
不会像早期版本那样把整批塞进一个请求（30 张以上必然超限，浏览器只报 `Failed to fetch`）。

你只需要最后 `git push` 一下。

> 这个页面只在本地 `pnpm dev` 下可用，安全性上做了三层：
>
> 1. **生产构建里没有它** —— `main.js` 用 `import.meta.env.DEV` 做门禁，`dist/` 里连 admin 的 chunk 都不会生成（可以自己 `ls dist/assets` 确认）；
> 2. **上传接口只在 dev server 存在** —— 由 Vite 的 `configureServer` 中间件提供，线上没有任何可写的后端；
> 3. **只收本机请求** —— 接口会检查 `Origin`，非 `localhost/127.0.0.1` 直接 403，防止别的网站在你开着 dev 时偷偷 POST。
>
> 所以不需要在 Vercel 配任何 Token，也不存在被人上传照片的入口。

## 目录约定

```
photos/
  gallery.json                ← 所有文案都在这一个文件里（可选）
  2024/
    宿迁/
      甲辰花火一.jpg          ← 照片
  _drafts/                    ← 以 _ 开头的目录会被跳过，适合放还没整理好的图
```

- **第一层是年份**：`photos/2024/...`。不是四位数字时，年份改从 EXIF / 文件名里的日期推。
- **第二层是地点**：可以嵌套，`photos/2024/江苏/宿迁/a.jpg` → 地点显示为 `江苏，宿迁`。
- **文件名（去掉扩展名）就是标题**。
- **以 `_` 或 `.` 开头的文件 / 目录不参与构建**。
- **懒得建目录就直接丢 `photos/` 根目录**：年份从 EXIF 或文件名里的日期（`20240224…`、`2024-02-24…`）推，地点留空。

### 元信息是怎么推出来的

`photos/gallery.json` 是可选的，只用来覆盖下面这些默认值：

| 字段 | 优先级 |
| --- | --- |
| 年份 | `gallery.json` 的 `date` → 目录年份 → EXIF 年份 → 文件名里的日期 → 文件修改时间 |
| 完整日期 | `date`（写到日）→ EXIF 拍摄时间（年份对得上时）→ 文件名里的日期（年份对得上时）→ 只显示年份 |
| 标题 | `title` → 文件名 |
| 地点 | `location` → 目录名 |
| 描述 | `desc` |

EXIF 只在年份对得上时采用，所以「目录写 2020、照片 EXIF 是 2021」时以目录为准 —— 想改就改文件夹名。

### gallery.json 里能写什么

```jsonc
{
  // 键是相对 photos/ 的路径
  "2024/宿迁/甲辰花火一.jpg": {
    "title": "甲辰花火一",        // 覆盖文件名
    "location": "宿迁，江苏",     // 覆盖目录名
    "date": "2024-02-09",         // 2024 / 2024-02 / 2024-02-09 都行
    "desc": "照片背后的故事…"      // 详情页的描述，可以多段（用 \n 换行）
  }
}
```

这个文件是**自动维护**的：

- 管理页保存时自动追加条目；
- 每次构建都会按路径排序、去掉空字段；
- 照片删了，对应条目会在下次构建时自动清掉，不会留死链接。

所以除了想手写文案，平时不用管它。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 生成相册数据 + 起本地开发服务器（含 `/admin` 管理页） |
| `pnpm build` | 生成相册数据 + 打包到 `dist/` |
| `pnpm preview` | 预览打包结果 |
| `pnpm gallery` | 只重新扫描 `photos/` 并生成图片产物（增量） |
| `pnpm gallery:force` | 忽略缓存，全部重新处理 |
| `pnpm gallery:clean` | 删掉 `public/generated/` 和缓存 |
| `pnpm lint` | oxlint |

## 构建时做了什么

`pnpm build` 会先跑 `scripts/gallery-cli.mjs`：

1. 递归扫描 `photos/`；
2. 读 EXIF 和 `photos/gallery.json`，解析出每张照片的元信息；
3. 用 sharp 生成 **缩略图（宽 800）** 和 **大图（宽 2560）**，都是 WebP，并按内容哈希命名；
4. 生成 blurhash 占位图；
5. 汇总成 `public/generated/manifest.json`，前端通过 `virtual:gallery` 拿到它。

产物全部落在 `public/generated/`（已 gitignore），**不需要提交缩略图**。文件名是内容哈希，所以 Vercel 上可以永久缓存。

处理结果按文件大小 + 修改时间缓存在 `.cache/`，没改过的照片第二次构建直接复用。

## 部署

### Vercel（推荐）

1. 在 [Vercel](https://vercel.com/new) 导入这个 GitHub 仓库，Framework 选 **Vite**，其余保持默认（`vercel.json` 已经写好构建命令和缓存头）。
2. 可选环境变量：

   | 变量 | 作用 |
   | --- | --- |
   | `VITE_API_BASE` | 表情回应后端的地址。**不配就不显示表情组件**，不会报错。 |

3. 之后每次 `git push` 到 `main` 都会自动重新构建部署。

> 构建机器上会装 `sharp` 并现场压图，37 张照片大约 1~2 分钟；照片再多就按这个比例估算。

### GitHub Actions

`.github/workflows/ci.yml` 会在 push / PR 时跑 `pnpm lint` + `pnpm build`，用来提前发现「某张图坏了」或者构建失败。它只做检查，部署仍然由 Vercel 负责。

## 目录结构

```
photos/                     照片源文件（唯一的输入）
  gallery.json              所有照片的文案（自动维护，可选）
scripts/
  gallery-core.mjs          扫描 + EXIF + 压图 + manifest + 写入新照片
  gallery-cli.mjs           命令行入口
  vite-plugin-gallery.mjs   virtual:gallery + dev 热更新
  vite-plugin-admin.mjs     dev 下的上传接口（写文件 + 重建）
src/
  gallery.config.js         站点级文案（标题、简介、作者、仓库地址）
  components/               照片墙 / 卡片 / 详情
  admin/AdminApp.vue        /admin 管理页面
public/
  fine-weather-gallery.ico
  generated/                构建产物（gitignore）
.github/workflows/ci.yml    push / PR 时 lint + build
vercel.json                 构建命令与缓存头
pnpm-workspace.yaml         pnpm 设置（放行 sharp 等依赖的安装脚本）
```

> `pnpm-workspace.yaml` 不是多包工程，只是 pnpm 11+ 之后配置项的唯一落点。
> 少了它，`sharp` 的原生二进制不会安装，构建会直接失败。

## 常见问题

**日期显示得不对？**
在 `photos/gallery.json` 里给这张图写 `"date": "2024-02-09"`，它优先级最高（管理页的日期框也是写这里）。

**想改标题？**
改文件名，或者在 `gallery.json` 里写 `title`（更推荐，文件名可以保持简洁）。

**`VITE_API_BASE` 填什么？**
**不用填。** 它是可选的「表情回应」后端地址：

- 留空 = 不显示表情组件，也不会加载 fingerprint 脚本（首屏更快），站点其他功能完全不受影响；
- 想启用就填一个自己部署的服务根地址（比如 `https://xxx.vercel.app`），它需要实现三个接口：

  | 方法 | 路径 | 说明 |
  | --- | --- | --- |
  | `GET` | `/reactions?symbol=fw` | 返回 `[{ "reaction": "👍", "reactors": ["visitorId"] }]` |
  | `POST` | `/reactions` | body `{ reaction, reactor, symbol }`，加一个回应 |
  | `DELETE` | `/reactions` | 同上，取消回应 |

  原作者这套后端没有开源，所以没有现成地址可以抄。

**照片还没整理，不想让它上线？**
放到 `photos/_drafts/`，构建会跳过。整理好了再挪到 `photos/<年份>/<地点>/`。

**能不能只提交照片不跑构建？**
可以。缩略图是 Vercel 上构建时生成的，本地不生成也能推送。

**以前那套 `images.json` / 每张图一个 `.md` 呢？**
都废弃了。旧数据一次性迁移进了 `photos/` 和 `photos/gallery.json`，`update.js`、`public/thumbnail/`、husky 里的 `img-update` 都已移除。
