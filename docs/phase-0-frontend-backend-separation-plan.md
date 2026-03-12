# Phase 0: 前后端分离改造基线

## 1. 目标

本阶段只做一件事：把当前小程序从“离线 mock 原型”梳理成一套可以逐 phase 落地的前后端分离方案。

本阶段不改业务逻辑，不接真实接口，不改页面行为。

本阶段输出：

- 数据域拆分
- 核心数据模型草案
- 接口清单草案
- 前端分层改造方案
- 页面迁移优先级
- 进入 Phase 1 前需要确认的事项

## 2. 当前项目结论

### 2.1 技术现状

- 项目为微信小程序。
- 已初始化 `wx.cloud`，说明可直接承接云函数和云数据库。
- 当前仅有一个用户初始化云函数，后端能力尚未形成统一接口层。
- 页面主要通过 `miniprogram/services/*` 取数，而不是直接从页面读取 mock。

### 2.2 当前数据入口

当前 mock 依赖主要集中在以下三个服务文件：

- `miniprogram/services/content.js`
- `miniprogram/services/orders.js`
- `miniprogram/services/user.js`

这意味着改造的主入口相对集中，页面层改动可控。

### 2.3 当前最大问题

当前问题不只是“数据写死了”，而是职责混在一起：

- mock 数据源读取
- 列表过滤与实体关联
- 页面展示用 view model 拼装
- 大量兜底文案生成
- 审核态/普通态文案切换

其中 `miniprogram/services/content.js` 已经近似一个前端 BFF，但里面混了数据源、业务规则和文案模板。后续一旦接后端，如果不先拆边界，接口会越来越乱。

## 3. 页面与数据域拆分

### 3.1 页面清单

当前页面共 16 个：

- splash
- home
- creators
- creator-detail
- destinations
- destination-detail
- ideas
- idea-detail
- service-detail
- how-it-works
- favorites
- profile
- orders
- order-detail
- checkout
- payment-result

### 3.2 推荐的数据域

建议拆成三大域：

#### A. 内容域 Content

用于驱动浏览型页面。

- creators
- destinations
- services
- ideas
- service periods
- service detail content blocks

覆盖页面：

- home
- creators
- creator-detail
- destinations
- destination-detail
- ideas
- idea-detail
- service-detail

#### B. 平台配置域 Config

用于驱动平台级静态内容、流程文案和运营配置。

- 首页 hero/banner
- how-it-works 流程
- 协议正文
- 咨询入口和二维码
- 审核态/正常态文案
- 结果页、空状态、提示文案

覆盖页面：

- home
- how-it-works
- checkout
- payment-result
- order-detail
- favorites
- profile

#### C. 交易域 Transaction

用于用户身份和真实业务闭环。

- users
- favorites
- orders
- order travelers
- order status history

覆盖页面：

- profile
- favorites
- orders
- order-detail
- checkout

## 4. 数据模型草案

以下为 Phase 1-3 的推荐实体。字段并非一次性全部落地，但要按这个边界设计。

### 4.1 creators

建议字段：

- id
- slug
- name
- avatar
- stance
- tags
- destinationSlugs
- about
- suitable
- notSuitable
- reviewList
- status
- sortOrder
- createdAt
- updatedAt

### 4.2 destinations

建议字段：

- id
- slug
- name
- cover
- description
- descriptionDetail
- serviceIds
- status
- sortOrder
- createdAt
- updatedAt

`routeCount`、`creatorCount` 这类字段建议不要长期手填，优先做派生字段或聚合结果。

### 4.3 services

建议字段：

- id
- slug
- name
- type
- creatorId
- destinationSlugs
- summary
- creatorQuote
- creatorRoles
- suitable
- suitableDetail
- notSuitable
- deliverables
- exclusions
- timeline
- revision
- refund
- priceText
- durationTag
- styles
- tags
- media
- status
- sortOrder
- createdAt
- updatedAt

说明：

- `priceText` 保留展示用途。
- 真正计算、下单用价格应以团期价格或后端价格为准。
- `tags` 当前包含 `meetingPoint/suggestedAge/minGroupSize/registrationDeadline`，后续应标准化。

### 4.4 service_periods

建议独立存储，不继续嵌在 service 里。

- id
- serviceId
- versionName
- dateStart
- dateEnd
- price
- status
- badge
- remainingSeats
- minGroup
- maxGroup
- createdAt
- updatedAt

### 4.5 service_detail_content

这是当前最关键的数据块。建议单独设计，不要完全依赖前端生成。

- serviceId
- sections
- overview
- highlights
- itinerary
- costs
- notices

可进一步拆为：

- service_overview
- service_highlights
- service_itinerary_days
- service_cost_items
- service_notice_items

是否拆表取决于后续管理后台复杂度。本期先允许以单文档形式存储。

### 4.6 ideas

建议字段：

- id
- slug
- title
- theme
- summary
- cover
- authorId
- destinationSlugs
- body
- cta
- status
- sortOrder
- createdAt
- updatedAt

### 4.7 app_configs

建议作为平台配置集合。

建议按 `key + value` 或模块化文档组织：

- `home.heroSlides`
- `home.featuredConfig`
- `howItWorks.flows`
- `agreements.service`
- `agreements.risk`
- `agreements.refund`
- `consultation.default`
- `ui.auditTexts`

### 4.8 users

建议字段：

- id
- openid
- nickname
- avatar
- role
- status
- createdAt
- updatedAt

### 4.9 favorites

建议字段：

- id
- userId
- targetType
- targetId
- createdAt

不要继续使用本地大对象结构作为最终形态。

### 4.10 orders

建议字段：

- id
- orderNo
- userId
- serviceId
- servicePeriodId
- serviceNameSnapshot
- serviceTypeSnapshot
- coverSnapshot
- creatorSnapshot
- destinationSnapshot
- travelDate
- peopleCount
- amount
- discount
- payable
- currency
- status
- contactName
- contactPhone
- note
- createdAt
- updatedAt

### 4.11 order_travelers

建议独立存储：

- id
- orderId
- name
- idCard
- phone
- wechat
- note

## 5. 后端接口草案

本项目虽然推荐先落在微信云开发，但前端仍按“前后端分离”的方式设计。前端不直接查表，不直接依赖云数据库结构，而是统一走接口层。

### 5.1 内容接口

- `GET /content/home`
- `GET /creators`
- `GET /creators/:slug`
- `GET /destinations`
- `GET /destinations/:slug`
- `GET /ideas`
- `GET /ideas/:slug`
- `GET /services/:slug`

其中：

- `GET /content/home` 返回首页 hero、精选创作者、精选目的地、精选故事。
- `GET /services/:slug` 直接返回服务详情页所需完整 payload，而不是只返回原始 service 表数据。

### 5.2 配置接口

- `GET /configs/how-it-works`
- `GET /configs/agreements`
- `GET /configs/consultation`
- `GET /configs/ui-texts`

说明：

- 不建议把所有按钮文案都后台化。
- 建议只把“业务经常变、运营希望改、审核态会切换”的文案放进配置域。

### 5.3 交易接口

- `POST /auth/wechat-login`
- `GET /me`
- `GET /me/favorites`
- `POST /me/favorites`
- `DELETE /me/favorites/:targetType/:targetId`
- `GET /orders`
- `GET /orders/:id`
- `POST /orders`
- `POST /orders/:id/cancel`

本期不接支付，因此不设计支付回调和对账接口。

## 6. 前端分层方案

### 6.1 推荐目录

建议在 `miniprogram` 下逐步增加：

- `api/`
- `repositories/`
- `mappers/`
- `constants/`

推荐职责：

#### api

只负责请求和响应。

例如：

- `api/content.js`
- `api/config.js`
- `api/order.js`
- `api/user.js`

#### repositories

负责数据源切换。

例如：

- `repositories/contentRepository.js`
- `repositories/orderRepository.js`
- `repositories/userRepository.js`

支持：

- mock repository
- cloud repository

#### mappers

负责把后端数据转成页面真正消费的数据结构，避免页面直接绑定接口原始结构。

### 6.2 页面调用链

目标调用链：

`page -> service/page-loader -> repository -> api/cloud function`

而不是：

`page -> service -> require(mock)`

### 6.3 fallback 策略

本项目允许保留 mock fallback，但必须统一管理：

- 允许通过环境开关切换数据源
- 不允许页面里散落条件分支
- 不允许未来长期双轨维护

## 7. 页面迁移优先级

### P0 优先

- home
- creators
- creator-detail
- destinations
- destination-detail
- ideas
- idea-detail
- how-it-works

原因：

- 都属于浏览型页面
- 风险低
- 能最快完成“内容脱 mock”

### P1 重点单列

- service-detail

原因：

- 当前结构最复杂
- 既有内容配置，又有团期、标签、媒体、费用、须知、行程等混合数据
- 是最需要提前定义契约的页面

### P2 交易链路

- checkout
- orders
- order-detail
- payment-result

原因：

- 依赖真实订单模型和用户态
- 这部分应该在内容域基本稳定后再改

### P3 用户中心

- profile
- favorites

原因：

- 依赖真实登录和收藏体系
- 不应先于用户模型落地

## 8. 当前字段归属建议

以下字段建议由后端提供：

- creators/destinations/services/ideas 主体内容
- 团期和价格
- 服务详情的结构化内容
- 协议正文
- 流程说明
- 咨询配置

以下字段建议仍由前端持有：

- 纯 UI 行为状态
- sticky tabs 的滚动状态
- 弹层开合状态
- loading/empty/error 状态

以下字段需要明确边界后再决定：

- 审核态文案
- 某些 section/tab 标题
- 某些按钮文案

建议标准：

- 经常改、运营控制、审核会切换：后端配置
- 固定 UI 语义、仅和组件相关：前端保留

## 9. Phase 1 实施建议

进入 Phase 1 后，建议按以下顺序做：

1. 增加 `api + repository + mapper` 基础设施
2. 先把 `content` 域切成异步数据流
3. 保留 mock repository 作为 fallback
4. 先接首页和内容型列表页
5. 再进入 `service-detail` 的 payload 收敛

## 10. 进入 Phase 1 前需要你确认的事项

只需要确认这 3 件：

### A. 服务详情数据谁主导

建议：

- `highlights / itinerary / costs / notices / periods` 由后端主导
- 前端只保留极少量兜底逻辑

### B. 配置化范围

建议本期纳入后端配置的内容：

- 首页 hero
- how-it-works
- 协议正文
- 咨询文案和二维码
- 订单结果页/报名结果页文案

### C. 订单链路目标

建议本期目标固定为：

- 真实报名提交
- 真实订单查询
- 真实收藏
- 不接支付

## 11. Phase 0 结论

本项目适合继续按以下路径推进：

- 后端形态：微信云开发
- 架构形式：逻辑前后端分离
- 先做内容域和配置域
- 服务详情单独重点治理
- 交易域后置
- 保留 mock fallback，但统一收口

当 Phase 1 开始时，不应再讨论“大方向”，而是直接进入代码层改造。
