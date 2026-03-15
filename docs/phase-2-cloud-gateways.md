# Phase 2: 云端网关与集合约定

## 1. 本阶段新增内容

本阶段新增了两个云函数入口：

- `cloudfunctions/contentGateway`
- `cloudfunctions/configGateway`

以及一套前端配置域链路：

- `miniprogram/config/static-config.js`
- `miniprogram/api/cloud/config.js`
- `miniprogram/repositories/config-repository.js`

当前策略：

- 内容域：`cloud -> fallback 到前端 legacy mock`
- 配置域：`cloud -> fallback 到前端 static config`

因此即使云函数未部署、集合未初始化，当前页面仍可继续运行。

## 2. 数据源策略

当前默认数据源已切为 `CLOUD`，定义在：

- `miniprogram/constants/data-source.js`

实际运行逻辑：

1. 前端优先请求云函数
2. 云函数返回失败或未部署
3. 仓储层自动回退到本地 legacy 数据

这意味着：

- 本地开发不被阻塞
- 云端一旦准备好，页面无需再次改造即可切换

## 3. 内容域集合约定

`contentGateway` 当前约定以下集合：

- `creators`
- `destinations`
- `services`
- `ideas`

可选配置集合：

- `app_configs`

### 3.1 creators

建议至少包含：

- `id`
- `slug`
- `name`
- `avatar`
- `stance`
- `tags`
- `destinationSlugs`
- `about`
- `suitable`
- `notSuitable`
- `serviceIds`
- `groupIds`
- `reviews`
- `status`

### 3.2 destinations

建议至少包含：

- `id`
- `slug`
- `name`
- `cover`
- `description`
- `descriptionDetail`
- `serviceIds`
- `status`

### 3.3 services

建议至少包含：

- `id`
- `slug`
- `name`
- `type`
- `creatorId`
- `destinationSlugs`
- `summary`
- `creatorQuote`
- `creatorRoles`
- `suitable`
- `suitableDetail`
- `notSuitable`
- `deliverables`
- `exclusions`
- `timeline`
- `revision`
- `refund`
- `price`
- `durationTag`
- `styles`
- `tags`
- `cover`
- `gallery`
- `groupPeriods`
- `travelDetail`
- `status`

### 3.4 ideas

建议至少包含：

- `id`
- `slug`
- `title`
- `theme`
- `summary`
- `cover`
- `authorId`
- `destinationSlugs`
- `body`
- `cta`
- `status`

## 4. 配置域集合约定

`configGateway` 和 `contentGateway` 都会读取 `app_configs` 集合。

建议文档结构：

```json
{
  "key": "howItWorksPage",
  "value": {
    "introText": "xxx",
    "ctaTitle": "xxx"
  }
}
```

优先使用 `key + value` 结构，不建议把大量无关字段平铺在根节点。

## 5. 当前已支持的配置 key

### 页面配置

- `howItWorksPage`
- `checkoutPage`
- `serviceDetailPage`
- `paymentResultPage`
- `orderDetailPage`
- `favoritesPage`

### 内容增强配置

- `homePage`

其中 `homePage` 可配置：

- `heroSlides`
- `featuredCreatorSlugs`
- `featuredDestinationSlugs`
- `featuredIdeaSlugs`

## 6. page config 示例

### 6.1 howItWorksPage

```json
{
  "key": "howItWorksPage",
  "value": {
    "flows": [
      { "title": "发现", "description": "..." },
      { "title": "选择服务", "description": "..." }
    ],
    "introText": "野哉会在报名确认、行前沟通与旅程履约之间提供清晰的信息同步与协作安排。",
    "ctaTitle": "下一步如何确认报名",
    "ctaDesc": "提交报名信息后，平台会统一跟进名额、时间与行前沟通安排。",
    "ctaButtonText": "查看咨询说明"
  }
}
```

### 6.2 checkoutPage

```json
{
  "key": "checkoutPage",
  "value": {
    "summaryTitleText": "报名摘要",
    "refundAgreementTitle": "变更说明",
    "amountLabelText": "参考金额",
    "submitButtonText": "提交报名信息",
    "agreements": {
      "service": { "title": "服务协议", "content": "..." },
      "risk": { "title": "风险告知书", "content": "..." },
      "refund": { "title": "变更说明", "content": "..." }
    }
  }
}
```

### 6.3 serviceDetailPage

```json
{
  "key": "serviceDetailPage",
  "value": {
    "consultWeChatQr": "https://...",
    "consultGroupQr": "https://...",
    "consultSheetTitle": "微信意向群",
    "consultCardLabel": "",
    "consultCardDesc": "扫码入群，咨询更多行程信息",
    "consultFollowupNote": "报名确认后，将为您同步带领者信息与行前准备",
    "timelineTitleText": "确认节奏",
    "refundTitleText": "变更说明",
    "serviceNoticeTitle": "报名说明",
    "serviceNoticeBody": "当前页面展示行程信息与报名入口，提交后将由平台进一步确认。"
  }
}
```

## 7. 当前页面改造范围

本阶段已将以下页面的硬编码配置迁移到配置仓储：

- `pages/how-it-works/index`
- `pages/favorites/index`
- `pages/checkout/index`
- `pages/service-detail/index`
- `pages/payment-result/index`
- `pages/order-detail/index`

## 8. 下一步建议

进入下一阶段前，建议你做两件事：

1. 在云环境中创建并填充上述集合与配置 key
2. 先录入最小可用数据：
   - `creators`
   - `destinations`
   - `services`
   - `ideas`
   - `app_configs.homePage`
   - `app_configs.howItWorksPage`
   - `app_configs.checkoutPage`
   - `app_configs.serviceDetailPage`

当这些数据准备好后，当前前端代码已经具备直接切云端读取的能力。
