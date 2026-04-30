# 用户/出行人拆分与后台出行人页重构方案

## 1. 目标

本次重构要同时解决 4 件事：

1. 明确区分 `用户`、`下单联系人`、`紧急联系人`、`出行人` 4 个业务概念。
2. 在 `yezaiadmin` 的“业务数据”分组下新增独立的“出行人”页面。
3. 用户详情页、订单详情页只展示精简版出行人信息，完整信息统一跳转到出行人详情页查看。
4. 让后台可以稳定查看“某个已保存的出行人档案”对应的订单和状态。

## 2. 当前现状

### 2.1 已经做对的部分

- 小程序登录用户已经有独立 `users` 集合。
- 已保存的常用出行人已经有独立 `user_travelers` 集合。
- 结账页已经支持从已保存出行人档案中选择并填充表单。
- 订单已经把实际出行人写入 `TravelOrder.travelersJson`，说明“订单快照”这个方向是对的。

### 2.2 当前主要问题

#### 问题 A：联系人和紧急联系人被混用

- 前端校验里 `contactName/contactPhone` 和 `emergencyContactName/emergencyContactPhone` 存在互相兜底。
- 服务端 `normalizeContact` 实际把“紧急联系人”当成订单联系人。
- `TravelOrder.travelerName/travelerPhone` 现在承载的其实是联系人语义，不是出行人语义。

#### 问题 B：订单快照丢失了和已保存出行人档案的稳定关联

- 结账页提交订单时，`travelers` 未把 `profileId` 写入订单快照。
- `buildPersistedTravelers` 当前也不会持久化 `profileId` 或 `user_travelers._id`。
- `adminGateway.normalizeTravelerSnapshot` 只解析姓名/手机号/证件等字段，不解析档案关联字段。

结果是：

- 从订单详情页里的“出行人”无法稳定跳到“该出行人的完整档案”。
- 后台要查询“某个出行人对应的订单”时，只能靠姓名/手机号/证件号模糊匹配。

#### 问题 C：后台展示层级不清

- 用户详情页直接展示了过多出行人档案信息。
- 订单详情页也直接展示了完整出行人敏感信息。
- 没有“全局出行人”视角，无法统一查看某个出行人档案及其关联订单。

## 3. 目标业务模型

### 3.1 概念定义

- `User`
  - 小程序登录用户。
  - 是下单人、支付主体、订单 owner。
  - 主键：`openid`，后台展示用 `users._id`。

- `TravelerProfile`
  - 用户保存的出行人档案。
  - 来源是 `user_travelers`。
  - 允许“从未实际出行，但已被用户保存”。

- `OrderContact`
  - 订单联系人。
  - 运营/客服在行前确认时优先联系此人。
  - 可以和用户本人相同，也可以不同。

- `EmergencyContact`
  - 紧急联系人。
  - 仅用于行中突发情况联系。
  - 不能与 `OrderContact` 混为一个字段。

- `OrderTravelerSnapshot`
  - 订单里的出行人快照。
  - 来源可能是某个 `TravelerProfile`，也可能是手工填写。
  - 下单后不可被用户修改历史订单内容。

### 3.2 关系

- `User` 1:N `TravelerProfile`
- `User` 1:N `TravelOrder`
- `TravelOrder` 1:N `OrderTravelerSnapshot`
- `TravelerProfile` 0:N `TravelOrder`
  - 通过订单快照里的 `profileId` / `travelerRecordId` 关联

## 4. 目标数据结构

### 4.1 `users`

保持现有定位，不做结构性拆分。继续保留统计字段：

- `travelerCount`
- `effectiveOrderCount`
- `effectiveRouteCount`
- `lastTravelAt`

### 4.2 `user_travelers`

继续作为“已保存出行人档案”的唯一主源，建议明确以下字段语义：

- `profileId`
  - 业务主键，外部引用统一使用它。
- `travelerId`
  - 兼容旧字段，迁移后与 `profileId` 保持相同值。
- `userId`
  - `users._id`
- `userOpenid`
  - 下单用户 openid
- `name`
- `gender`
- `birthday`
- `phone`
- `phoneMasked`
- `wechat`
- `email`
- `note`
- `documents[]`
  - 完整证件列表，保留原始证件号
- `idType` / `idNumber`
  - 首证件冗余字段，便于检索
- `emergencyName`
- `emergencyPhone`
- `emergencyRelation`
- `isDefault`
- `status`
- `source`
- `version`
- `lastUsedAt`
- `createdAt`
- `updatedAt`

推荐新增 5 个后台聚合字段，用于“出行人列表”页快速展示：

- `relatedOrderCount`
- `lastRelatedOrderNo`
- `lastRelatedOrderStatus`
- `lastRelatedOrderAt`
- `lastRelatedServiceName`

这些字段是冗余缓存，不是事实主源。

### 4.3 `TravelOrder`

#### 保留的核心字段

- `orderNo`
- `userOpenid`
- `serviceSlug`
- `servicePeriodCode`
- `status`
- `amountDec`
- `discountDec`
- `payableDec`
- `peopleCountInt`
- `travelDateStartDate`
- `travelDateEndDate`
- `travelersJson`

#### 建议新增的语义化字段

- `orderContactName`
- `orderContactPhone`
- `emergencyContactName`
- `emergencyContactPhone`

#### 保留但逐步退役的兼容字段

- `travelerName`
- `travelerPhone`

迁移期内：

- 写入时双写：
  - `orderContactName/orderContactPhone`
  - `travelerName/travelerPhone`
- 读取时优先读新字段，老字段只作为 fallback。

### 4.4 `travelersJson` 快照结构

现状快照缺少与档案的关联字段。建议扩展为“紧凑但可追踪”的结构。

建议新增字段：

- `pid`
  - `profileId`
- `rid`
  - `user_travelers._id`
- `src`
  - `traveler_profile` / `manual`

完整快照语义如下：

- `n`: 姓名
- `p`: 手机号
- `t`: 主证件类型
- `i`: 主证件号
- `ds`: 证件列表
- `g`: 性别
- `b`: 生日
- `w`: 微信号
- `e`: 邮箱
- `o`: 备注
- `pid`: 出行人档案 `profileId`
- `rid`: 出行人档案记录 `_id`
- `src`: 来源

## 5. 后台页面方案

## 5.1 新增导航

在 [navigation.tsx](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezaiadmin/src/config/navigation.tsx) 的“业务数据”中新增：

- `/admin/travelers`
- 标签：`出行人`

## 5.2 新增路由

在 [index.tsx](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezaiadmin/src/router/index.tsx) 新增：

- `/admin/travelers`
- `/admin/travelers/:travelerId`

其中：

- `travelerId` 统一使用 `user_travelers._id`
- 页面内展示 `profileId` 作为业务档案编号

## 5.3 出行人列表页

建议新增：

- [index.tsx](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezaiadmin/src/pages/travelers/index.tsx)

### 列表页字段

- 姓名
- 所属用户
- 性别
- 生日
- 手机号（建议默认脱敏）
- 主证件类型
- 主证件号（建议默认脱敏）
- 默认档案
- 档案状态
- 关联订单数
- 最近关联订单状态
- 最近使用时间
- 最近更新时间

### 列表页筛选

- 关键词：姓名 / 手机号 / 证件号 / profileId / 用户昵称
- 状态：active / inactive
- 是否有订单：yes / no
- 默认档案：yes / no

### 列表页操作

- 查看详情
- 查看所属用户
- 查看关联订单

## 5.4 出行人详情页

建议新增：

- [detail.tsx](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezaiadmin/src/pages/travelers/detail.tsx)

### 详情页区块

#### 基本信息

- 所属用户
- `profileId`
- `source`
- `isDefault`
- `status`
- `version`
- `createdAt`
- `updatedAt`
- `lastUsedAt`

#### 完整出行人信息

- 姓名
- 性别
- 生日
- 手机号
- 微信号
- 邮箱
- 备注

#### 完整证件信息

- 多行证件表格：
  - 证件类型
  - 证件号

#### 紧急联系人信息

- 姓名
- 手机号
- 关系

#### 关联订单

- 订单号
- 路线
- 团期
- 状态
- 出发日期
- 结束日期
- 订单更新时间
- 操作：查看订单

## 5.5 用户详情页改造

改造 [detail.tsx](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezaiadmin/src/pages/users/detail.tsx)

当前“出行人档案”卡片改为精简信息，仅保留：

- 姓名
- 性别
- 生日
- 手机号（脱敏）
- 状态
- 更新时间
- 操作：查看出行人

不再直接展示：

- 完整证件列表
- 证件号
- 微信号
- 邮箱
- 紧急联系人

## 5.6 订单详情页改造

改造 [index.tsx](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezaiadmin/src/pages/orders/index.tsx)

### 订单概况区

把“联系人”从旧字段语义切到：

- `orderContactName`
- `orderContactPhone`

### 出行人区

只保留精简字段：

- 姓名
- 性别
- 生日
- 手机号
- 操作：查看出行人

如果某个订单快照出行人无法匹配到已保存档案：

- 展示“无对应档案”
- 仍展示快照精简信息
- 不提供跳转

## 6. 接口改造方案

## 6.1 新增 adminGateway action

建议新增：

- `listTravelers`
- `getTravelerDetail`

建议新增前端 service：

- `listTravelersPage`
- `getTravelerDetail`

对应文件：

- [admin.ts](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezaiadmin/src/services/admin.ts)
- [index.js](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezainative/cloudfunctions/adminGateway/index.js)

## 6.2 修改现有 adminGateway action

### `getUserDetail`

返回的 `travelers` 改为精简结构，并增加跳转主键：

- `travelerRecordId`
- `profileId`
- `name`
- `gender`
- `birthday`
- `phoneMasked`
- `status`
- `updatedAt`

### `getOrderDetail`

返回的 `travelers` 中增加：

- `profileId`
- `travelerRecordId`
- `matchedTravelerRecordId`
- `matchedProfileId`
- `isLinkedToTravelerProfile`

页面只展示精简信息，但保留跳转需要的主键。

## 6.3 小程序下单链路改造

### 前端

改造：

- [index.js](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezainative/miniprogram/pkg/explore/checkout/index.js)
- [form-validation.js](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezainative/miniprogram/pkg/explore/checkout/form-validation.js)

要求：

- `contactName/contactPhone` 独立校验，不再从紧急联系人兜底。
- `emergencyContactName/emergencyContactPhone` 独立校验。
- 提交订单时，对每个 traveler 透传：
  - `profileId`
  - `travelerRecordId`（建议使用 `user_travelers._id`）
  - `source`

### 服务端

改造：

- [order-validation.js](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezainative/cloudfunctions/transactionGateway/order-validation.js)
- [index.js](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezainative/cloudfunctions/transactionGateway/index.js)

要求：

- 把当前 `normalizeContact` 拆成：
  - `normalizeOrderContact`
  - `normalizeEmergencyContact`
- `validateOrderParticipants` 同时校验：
  - 联系人
  - 紧急联系人
  - 全部出行人
- `buildPersistedTravelers` 新增 `pid/rid/src`
- `createOrder` 双写新旧联系人字段

## 7. 迁移清单

## 7.1 结构迁移

### `TravelOrder`

1. 在数据模型中新增：
   - `orderContactName`
   - `orderContactPhone`
2. 保留：
   - `travelerName`
   - `travelerPhone`
3. 更新：
   - [TravelOrder.json](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezainative/database-schemas/TravelOrder.json)
   - [cloud-models.d.ts](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezainative/cloud-models.d.ts)
   - [README.md](/Users/lihaisen/Desktop/code/yezaiminiprogram/yezainative/README.md)

### `user_travelers`

1. 统一 `travelerId = profileId`
2. 为旧数据补充：
   - `userId`
   - `relatedOrderCount`
   - `lastRelatedOrderNo`
   - `lastRelatedOrderStatus`
   - `lastRelatedOrderAt`
   - `lastRelatedServiceName`

## 7.2 数据迁移

### 迁移一：联系人字段语义纠正

目标：

- 新订单写新字段
- 老订单补齐 `orderContactName/orderContactPhone`

规则：

- `orderContactName = travelerName`
- `orderContactPhone = travelerPhone`

说明：

- 这一步只做“字段语义搬正”，不改订单快照。

### 迁移二：订单快照补档案关联

目标：

- 为历史订单 `travelersJson` 尽量补齐 `pid/rid/src`

匹配优先级：

1. 同用户 + `profileId` 直接命中
2. 同用户 + 证件号 + 姓名
3. 同用户 + 手机号 + 姓名
4. 同用户 + 仅姓名

只有在“唯一命中”时才写回；多命中或无法命中时保留空值并记录日志。

### 迁移三：回填 `user_travelers` 聚合统计

为每个已保存出行人档案回填：

- `relatedOrderCount`
- `lastRelatedOrderNo`
- `lastRelatedOrderStatus`
- `lastRelatedOrderAt`
- `lastRelatedServiceName`
- `lastUsedAt`

### 迁移四：后台读模型切换

依次切换：

1. `adminGateway.getOrderDetail` 优先读 `orderContactName/orderContactPhone`
2. `yezaiadmin` 订单详情 UI 切到新字段
3. `yezaiadmin` 用户详情出行人表切成精简版
4. 上线新“出行人”列表页和详情页

## 7.3 建议脚本

建议新增 3 个脚本或 adminGateway 维护 action：

1. `backfillOrderContactFields`
2. `backfillOrderTravelerProfileRefs`
3. `backfillTravelerOrderStats`

输出内容至少包括：

- 扫描总数
- 成功回填数
- 多命中数
- 未命中数
- 错误数

## 8. 推荐实施顺序

### Phase 1：语义纠偏

- 拆分联系人和紧急联系人校验/写入逻辑
- `TravelOrder` 新增 `orderContactName/orderContactPhone`
- 读路径优先新字段

### Phase 2：订单快照可追踪

- checkout 提交订单时补 `profileId/travelerRecordId/source`
- `buildPersistedTravelers`、`normalizeTravelerSnapshot` 支持新字段

### Phase 3：后台出行人页

- 新增 `listTravelers/getTravelerDetail`
- 新增 `yezaiadmin` 出行人列表页/详情页
- 导航和路由接入

### Phase 4：旧页面瘦身

- 用户详情页只保留精简出行人信息
- 订单详情页只保留精简出行人信息
- 通过链接跳到出行人详情页看完整信息

### Phase 5：历史数据回填

- 迁移联系人字段
- 回填订单快照档案关联
- 回填 `user_travelers` 聚合统计

## 9. 验收标准

### 业务验收

1. 新建一个出行人档案但不下单，也能在“业务数据 > 出行人”中看到。
2. 从出行人详情页可以看到该档案关联的订单和状态。
3. 从用户详情页点击出行人，可以跳到完整档案页。
4. 从订单详情页点击出行人，可以跳到完整档案页。
5. 对没有已保存档案的历史订单出行人，订单详情页仍能展示精简快照，但不会错误跳转。

### 技术验收

1. 新订单 `travelersJson` 中带有 `pid/rid/src`。
2. 新订单同时写入 `orderContactName/orderContactPhone`。
3. `getOrderDetail` 不再把 `travelerName/travelerPhone` 当成“出行人字段”使用。
4. `getUserDetail` 和 `getOrderDetail` 的出行人返回结构都变成精简版。

## 10. 本次重构的关键取舍

- `user_travelers` 继续作为“已保存出行人”的事实主源。
- `TravelOrder.travelersJson` 继续作为“订单出行人快照”的事实主源。
- 不新增独立“订单-出行人关联表”，先依赖快照里的 `profileId/rid` 建立关联。
- 为了后台列表性能，在 `user_travelers` 中增加冗余统计字段，而不是引入一张新关系表。

这个方案对当前仓库最稳妥，改动范围可控，也符合你要的后台体验：完整敏感信息集中到“出行人详情页”，用户详情页和订单详情页只保留轻量视图。
