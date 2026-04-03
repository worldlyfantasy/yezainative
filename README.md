# 野哉小程序

这是一个基于 CloudBase 的微信小程序项目，当前采用“内容留在文档库，交易迁到 SQL”的双存储架构。

## 当前环境

- CloudBase 环境：`yezai-3gr73wd48057512e`
- 环境别名：`yezai`
- 地域：`ap-shanghai`
- 小程序根目录：`miniprogram`
- 云函数根目录：`cloudfunctions`

## 项目结构

- 小程序前端：`miniprogram`
- 内容型云函数：`contentGateway`
- 交易型云函数：`transactionGateway`
- 配置云函数：`configGateway`
- 用户云函数：`userGateway`
- 维护型云函数：`maintenanceGateway`
- 一次性 SQL 回填函数：`sqlSync`

## 数据架构

### NoSQL 文档库

以下集合继续作为内容主数据或轻交互数据源：

- `services`
- `creators`
- `destinations`
- `ideas`
- `favorites`
- `users`
- `app_configs`

### SQL 数据模型

订单域迁移到 CloudBase MySQL：

- `ServicePeriod`
  - 存储服务期次、价格、库存、成团状态
- `TravelOrder`
  - 存储订单主记录、联系人、出行日期、金额、状态、服务快照

订单表字段标准化（2026-03-23）：

- 金额标准字段：`amountDec/discountDec/payableDec`（`DECIMAL(10,2)`）
- 人数标准字段：`peopleCountInt`（`INT`）
- 日期标准字段：`travelDateStartDate/travelDateEndDate`（`DATE`）
- 兼容字段保留：`amount/discount/payable`、`peopleCount`、`travelDateStart/travelDateEnd`

已补充的关键索引：

- `ServicePeriod(periodCode)` 唯一索引
- `ServicePeriod(serviceSlug, dateStart)` 普通索引
- `TravelOrder(orderNo)` 唯一索引
- `TravelOrder(userOpenid, createdAtTs)` 普通索引
- `TravelOrder(userOpenid, clientRequestId)` 唯一索引
- `TravelOrder(servicePeriodCode)` 普通索引
- `TravelOrder(status, createdAtTs)` 普通索引

文档库已补充的关键索引：

- `users(openid)` 唯一索引
- `favorites(openid, targetType, targetSlug)` 唯一索引
- `favorites(openid, createdAt)` 普通索引

## 已完成的迁移改造

### 后端

- `transactionGateway`
  - 订单读取改为从 `TravelOrder` 查询
  - 下单时改为按 `ServicePeriod` 服务端定价
  - 下单金额改为仅由服务端结算，忽略客户端传入的 `discount`
  - 下单时改为基于 SQL 条件更新的乐观锁扣减库存
  - 取消订单时先 compare-and-set 更新订单状态，再回补对应期次名额
  - `payOrder` 默认禁用（仅在 `ENABLE_CLIENT_PAY_ORDER=true` 时可调用）
- `contentGateway`
  - 服务详情页的 `groupPeriods` 优先从 `ServicePeriod` 读取
  - SQL 无数据时，回退到 `services.groupPeriods`
  - 对外返回的 `service` 已统一补齐 `priceLabel`，并不再把原始 `groupPeriods` 暴露给前端主流程
- `sqlSync`
  - 仅用于从 `services.groupPeriods` 回填 SQL 期次
  - 设计为可重复执行，重复执行会更新已有记录
  - 现在必须显式传 `payload.useLegacyGroupPeriods=true` 才会执行，避免误把 NoSQL 期次继续当主源

### 前端

- 服务详情页下单跳转新增 `periodCode`
- 结算页下单时不再信任前端金额
- 下单请求改为传递 `periodCode` 和 `versionName`
- 服务展示价优先读取 `priceLabel`，`price` 仅保留兼容意义
- 订单列表、订单详情、我的旅程仍走原有 repository/API 封装，但底层已经切到 SQL 云函数

## 迁移执行记录

执行时间：`2026-03-21`、`2026-03-23`

首次回填结果：

- `ServicePeriod`：新增 `27` 条
- `TravelOrder`：新增 `1` 条
- 文档库中的 `orders` 及其归档集合已删除，SQL 成为订单唯一数据源

结构优化结果（2026-03-23）：

- 新增标准字段并完成回填：
  - `TravelOrder`: `amountDec/discountDec/payableDec/peopleCountInt/travelDateStartDate/travelDateEndDate`
  - `ServicePeriod`: `priceDec/minGroupInt/totalSeatsInt/remainingSeatsInt/dateStartDate/dateEndDate`
- 清理废弃字段：
  - `TravelOrder.contactName-drop-1774251802`
  - `TravelOrder.contactPhone-drop-1774251802`
  - `TravelOrder.createdAtText`
- 建立回滚快照表：
  - `TravelOrder_backup_20260323`
  - `ServicePeriod_backup_20260323`

## 维护建议

- 新增服务期次时，应同步写入 `ServicePeriod`，不要只改 `services.groupPeriods`
- `services.priceLabel` 是服务卡片/摘要价文案，`ServicePeriod.price` 才是真实成交价
- `transactionGateway` 的 `payOrder` 仅保留本地/联调开关用途，生产建议由支付回调驱动订单状态流转
- 客户端仅提交下单上下文，金额折扣统一在服务端结算，不要在前端计算最终应付
- 如果后续接入真实支付，建议继续补充：
  - `payment_transactions`
  - `order_events`
  - 跨订单与库存的事务性补偿或事件流水

## Seed 导入

`docs/cloud-seed` 里的 JSON 现在可以通过脚本回灌到 NoSQL 文档库：

1. 安装云函数依赖：
   - `node scripts/install-cloudfunctions-deps.js`
2. 先本地预演：
   - `node scripts/import-cloud-seed.js --dry-run`
3. 再带腾讯云密钥执行导入：
   - `TCB_SECRET_ID=xxx TCB_SECRET_KEY=xxx node scripts/import-cloud-seed.js`

常用参数：

- `--collections services,creators,destinations`：只导入指定集合
- `--reset`：先清空目标集合，再按 seed 全量重灌
- `--seed-dir /absolute/path/to/cloud-seed`：覆盖默认 seed 目录

说明：

- 当前脚本只处理 NoSQL 集合：`app_configs / creators / destinations / ideas / services / users / favorites`
- `ServicePeriod` 和 `TravelOrder` 仍然属于 SQL 域，不在这个脚本里导入

## 图片多尺寸回填

内容图片现在支持落库为 `{ original, card, detail }` 结构。对历史图片做回填时，可先本地预演：

```bash
TCB_SECRET_ID=xxx TCB_SECRET_KEY=xxx node scripts/backfill-image-assets.js --dry-run
```

确认数量后再正式执行：

```bash
TCB_SECRET_ID=xxx TCB_SECRET_KEY=xxx node scripts/backfill-image-assets.js
```

常用参数：

- `--collections services,creators,destinations,ideas,app_configs`：只回填指定集合
- `--limit 10`：先抽样处理少量文档

说明：

- `services / creators / destinations / ideas / app_configs(homePage.heroSlides)` 都支持回填
- 脚本可重复执行，已有完整 `{ original, card, detail }` 的图片会直接跳过

## 草稿图片清理

`maintenanceGateway` 负责清理 `content/services/draft/` 下超期且未被数据库引用的草稿图。

默认策略：

- 仅扫描 `content/services/draft/`
- 仅删除超过 `7` 天的未引用文件
- 单次最多删除 `50` 个对象
- 已配置为每天凌晨定时执行

手动预演：

```bash
cloudbase functions:invoke maintenanceGateway --data '{"action":"cleanupDraftAssets","payload":{"dryRun":true}}'
```

手动执行：

```bash
cloudbase functions:invoke maintenanceGateway --data '{"action":"cleanupDraftAssets","payload":{"dryRun":false}}'
```

返回结果会包含：

- `candidateCount`：当前满足删除条件的文件数
- `deletedCount`：本次实际删除数
- `candidateSamples`：待删文件样例
- `deletedKeys`：已删除文件列表

## 回归自检

本地核心链路自检可直接执行：

```bash
node scripts/run-core-self-check.js
```

当前脚本会顺序执行：

- `yezainative/tests/*.test.js`
- `yezaiadmin` 的 `npm test`
- `yezaiadmin` 的 `npm run build`

说明：

- 这是“本地逻辑 + 后台构建”的一键回归，不会改动 CloudBase 线上数据
- 线上真实下单云函数依赖微信 `OPENID`，无法通过普通 `invokeFunction` 直接完整模拟
- 2026-03-27 已补齐并发布 `TravelOrder / ServicePeriod` 数据模型的标准字段定义，并完成了一次带清理的 SQL 烟测

## 控制台入口

- 云函数管理：[Cloud Functions](https://tcb.cloud.tencent.com/dev?envId=yezai-3gr73wd48057512e#/function/list)
- MySQL 数据库：[MySQL](https://tcb.cloud.tencent.com/dev?envId=yezai-3gr73wd48057512e#/db/mysql/table/default/)
- 数据模型：[Data Models](https://tcb.cloud.tencent.com/dev?envId=yezai-3gr73wd48057512e#/lowcode/model)
