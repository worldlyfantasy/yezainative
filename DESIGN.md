# Yezai Native DESIGN.md

本文件定义野哉微信小程序的视觉和交互约束，供 AI 在生成或重构页面时直接读取。

设计目标不是做成通用旅游商城，而是做成「有在地质感的旅行内容产品」：兼具文学感、真实感、可浏览性和明确转化路径。

参考气质：
- Notion 的暖中性色、轻边框和克制留白
- Airbnb 的旅行浏览逻辑、图片优先和卡片转化
- Apple 的大图叙事与高级留白
- 现有野哉品牌语汇：纸张感、宋体标题、暖棕与土橙色

## 1. Visual Theme & Atmosphere

### Core Mood

- 关键词：在地、温润、克制、真实、沉静、可触摸、有人情味
- 页面应像一本被认真编排的旅行札记，不像促销味很重的 OTA，也不像潮流感过强的 lifestyle app
- 首页和详情页应让用户先被内容和人物吸引，再进入报名动作
- 整体节奏偏慢，但交互反馈必须清晰、轻快、可预期

### Product Character

- 这是内容驱动的旅行产品，不是价格驱动的交易产品
- 人、路线、目的地、旅途叙述，比折扣、角标、强促销文案更重要
- 每屏只允许一个主动作最突出，例如“查看全部”“立即报名”“选择团期”

### Density Rules

- 首屏允许大面积图片和留白
- 内容区保持舒展，但不可松散到丢失结构
- 卡片信息层级控制在 3 层以内：标题、摘要、辅助信息
- 同一区域不要同时出现过多按钮、标签、徽章和图标

## 2. Color Palette & Roles

### Core Palette

| Token | Value | Role |
|---|---|---|
| Paper | `#F2E6C9` | 全局底色、主背景 |
| Paper Soft | `#F9F4EC` | 内容区背景、浅色容器 |
| Paper Lifted | `#FFF9F2` | 浮起卡片、弹层、重点面板 |
| Paper Deep | `#EAD9BC` | 分隔背景、次级层 |
| Ink | `#2B241D` | 主文字、强对比标题 |
| Ink Soft | `#6A5A4B` | 正文、说明文字 |
| Ink Muted | `#8A7563` | 次级说明、辅助标签 |
| Brand | `#993921` | 品牌线条、强调边框、次级强调 |
| Accent | `#D15E14` | 主 CTA、激活态、重点交互 |
| Accent Deep | `#B54E16` | 主 CTA 按下态、深色强调 |
| Brown | `#8A5A38` | 标签、人物辅助信息、温暖中介层 |
| Olive | `#5C6B4C` | 成功态、自然主题辅助色 |

### Functional Color Rules

- 默认背景使用 `Paper` 或 `Paper Soft`
- 大块卡片优先使用 `Paper Soft` 或 `Paper Lifted`，不要用纯白打断整体气质
- 主要文字固定使用 `Ink`
- 正文和说明优先使用 `Ink Soft`
- `Accent` 只用于主操作、当前选中项、关键价格或报名入口
- `Brand` 更适合边框、下划线、标签、次级强调，不要替代主 CTA
- 图片遮罩使用暖黑渐变，不用冷灰或蓝黑

### Avoid

- 不要引入高饱和蓝、紫、荧光绿做主色
- 不要用纯黑大面积铺底
- 不要出现电商式满屏红色角标
- 不要在同一屏混用超过 1 个高饱和强调色

## 3. Typography Rules

### Font Families

- Display / Heading:
  - `"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif`
- Body / UI:
  - `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif`

### Hierarchy

| Usage | Size | Weight | Line Height |
|---|---|---|---|
| Hero Title | `64rpx` to `76rpx` | `500` | `1.35` to `1.5` |
| Page Title | `52rpx` to `64rpx` | `500` | `1.4` to `1.55` |
| Section Title | `34rpx` to `40rpx` | `500` | `1.45` |
| Card Title | `30rpx` to `34rpx` | `500` | `1.35` to `1.5` |
| Body | `26rpx` to `30rpx` | `400` | `1.8` to `1.95` |
| Meta / Tag | `20rpx` to `24rpx` | `400` to `500` | `1.4` to `1.6` |

### Typography Rules

- 宋体只用于标题、引语、封面文案、重要名称，不用于长段落 UI 文本
- 长正文必须使用无衬线字体，保证真机可读性
- 中文行距宁可稍松，不可过挤
- 不依赖颜色区分层级，优先用字号、留白、字重
- 长标题允许换行，不要为了整齐过度压缩字间距
- 金额、日期、期次等信息允许更紧凑，但仍需保持舒展的上下边距

## 4. Component Stylings

### Hero / Cover Area

- 首页和详情头图应是沉浸式的、图片优先的
- 图上文案只放 1 个主标题和 1 至 2 段辅助文字
- 遮罩必须保证文字可读，但不可重到压暗整张图
- 插画型头图可保留品牌艺术化处理，但比例和配色需与真实图片共存

### Cards

- 卡片圆角：`18rpx` to `24rpx`
- 以柔和纸张底和轻阴影为主，不做硬边科技卡片
- 卡片内部信息顺序优先为：图像、标题、摘要、辅助信息
- 卡片底部不要堆满按钮；列表场景优先整卡可点

### Buttons

- 主按钮：
  - 使用 `Accent` / `Accent Deep`
  - 圆角胶囊型
  - 最小高度 `88rpx`
  - 文案简短直接，例如“立即报名”“查看团期”
- 次按钮：
  - 使用浅底加品牌边框
  - 适合作为次级跳转、收藏、查看更多
- 禁止同屏出现多个视觉同级主按钮

### Tabs / Chips

- Tab 应轻、窄、清楚，优先用下划线或底部强调，不做厚重分段器
- Tag / Chip 用于人物角色、路线标签、行程属性
- Tag 背景使用低饱和暖色透明层，不使用纯色大块填充
- 可点击标签必须在视觉上与静态标签区分

### Period Cards

- 团期选择区必须是强结构区块，信息层级为：
  - 日期
  - 价格
  - 状态
  - 版本或时长
- 选中态以边框、浅底和勾选表现，不要只靠文字颜色变化
- 报名 CTA 与团期卡区块保持空间关联

### Creator / Idea / Destination Modules

- 创作者模块优先展示头像、名字、角色和一句有温度的立场表达
- 旅行文学模块更偏阅读感，不要做成资讯列表
- 目的地和路线模块更偏发现感，可以适当提高图片占比

### Forms And Checkout

- 表单应降低压力感，按步骤阅读而不是一次性压满
- 字段分组明确，错误信息贴近字段
- 输入容器以浅纸色和细边框为主，不用工业灰输入框
- 金额确认、联系人、出发日期必须一眼可确认

### Navigation And Bottom Bar

- 自定义 tab bar 应保持轻薄、稳定、低干扰
- 当前激活项用 `Accent` 或 `Brand`，不可过于抢眼
- 页面底部固定操作区必须预留安全区和内容滚动空间

### Feedback States

- Skeleton 必须保留真实布局骨架
- 空状态应有温和引导，不做系统默认空白页
- 错误提示可以直白，但语气不要生硬

## 5. Layout Principles

### Spacing System

- 使用基于 `8rpx` 的节奏
- 常用间距：`12rpx`, `16rpx`, `20rpx`, `24rpx`, `32rpx`, `40rpx`, `48rpx`, `64rpx`
- 页面左右安全边距通常为 `32rpx` to `40rpx`
- 区块与区块之间优先用留白和插图分隔，不用重边线

### Page Structure

- 首页采用「大图引入 + 内容区块串联」结构
- 详情页采用「图集 + 标题信息 + 关键信息卡 + 分段内容 + 底部动作」结构
- 列表页优先使用纵向堆叠和横向滑动卡带结合
- 文章和长内容页采用单列阅读结构

### Content Hierarchy

- 每个 section 必须有清晰入口：标题、简述或去向链接
- 同一屏不混合太多不同宽度和不同圆角的容器
- 如果一个区域已经有图片主导，就减少边框和装饰
- 首屏下方第一屏应快速让用户知道能做什么：看路线、看创作者、看内容

## 6. Depth & Elevation

### Surface Hierarchy

- Level 0: 全局纸色背景
- Level 1: 正常内容卡片、段落区块
- Level 2: 团期卡、浮起重点信息块、底部操作条
- Level 3: 弹层、媒体查看器、确认面板

### Shadow Rules

- 阴影轻、散、暖，不用冷硬深阴影
- 卡片阴影优先表达“纸张轻轻浮起”
- 图片上的层级主要依靠遮罩和内容留白，不靠重投影

## 7. Do's And Don'ts

### Do

- 保留野哉现有暖纸色和宋体标题识别度
- 用真实摄影、人物肖像、行进中的细节建立信任
- 让信息有呼吸感，但操作路径要明确
- 让“报名”在适当时机出现，而不是一上来就压迫式推销
- 让创作者、路线、目的地、文学内容形成一致叙事链路

### Don't

- 不要做成通用旅游电商首页
- 不要使用强科技感玻璃拟态、霓虹边框、冷色发光
- 不要把所有区块都做成重卡片
- 不要到处放图标、徽章、价格标签和营销话术
- 不要出现大面积纯白、纯黑、纯灰造成品牌断层
- 不要依赖 hover、复杂手势或桌面端特性

## 8. Responsive Behavior

### Device And Touch Rules

- 微信小程序优先考虑单手触达和竖屏阅读
- 所有可点击元素最小热区 `88rpx x 88rpx`
- 相邻可点元素至少保留 `8rpx` 间隔
- 必须处理 `safe-area-inset-bottom`
- 固定底部栏和底部按钮不能遮挡内容

### Text And Media Rules

- 中文长标题允许两行或三行，不强行单行省略
- 图片容器必须预留比例，避免加载后跳动
- 横向滚动区域要清楚暗示“还能继续滑”
- 重要信息不能仅存在于图片里

### Performance-Oriented Rules

- 非首屏图片启用懒加载
- Skeleton 和占位高度必须接近真实内容
- 动效应控制在 `180ms` 到 `300ms`
- 不做大面积连续动画，不做装饰性粒子效果

## 9. Agent Prompt Guide

### Quick Reference

- 背景优先：`#F2E6C9`, `#F9F4EC`, `#FFF9F2`
- 主文字：`#2B241D`
- 次文字：`#6A5A4B`
- 主强调：`#D15E14`
- 次强调 / 边框：`#993921`

### Prompt Rules

- 优先保留现有数据结构、路由和业务逻辑
- 优先调整 WXML、WXSS、组件层级和信息结构
- 如果没有明确要求，不新增复杂动效和额外业务流程
- 每次改造聚焦一个页面或一个组件族，避免全局风格漂移

### Example Prompt: Home

> Use this DESIGN.md to redesign the home page of the Yezai mini program. Keep the current data fields and page routing. Preserve the warm paper palette and serif Chinese headlines. Increase browsing clarity and improve the transition from hero content to featured journeys, creators, and travel writing. Make it feel editorial and premium, not like a generic travel marketplace.

### Example Prompt: Service Detail

> Use this DESIGN.md to redesign the service detail page. Keep the current business logic for periods, favorites, and checkout. Strengthen the visual hierarchy from gallery to creator trust, route highlights, period selection, and signup CTA. Make the page feel calm, tactile, and conversion-ready.

### Example Prompt: Checkout

> Use this DESIGN.md to refine the checkout page of the mini program. Keep all fields and APIs unchanged. Reduce cognitive load, group information clearly, and make the final confirmation area feel trustworthy and easy to scan on mobile.
