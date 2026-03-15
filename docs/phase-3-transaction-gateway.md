# Phase 3: 交易网关与集合约定

## 1. 本阶段新增内容

本阶段新增：

- `cloudfunctions/transactionGateway`
- `miniprogram/api/cloud/transaction.js`
- `miniprogram/repositories/transaction-repository.js`

并将以下交易行为切到仓储层：

- 提交报名
- 订单列表读取
- 订单详情读取
- 订单状态更新
- 收藏切换
- 收藏列表读取

当前策略：

- 交易域：`cloud -> fallback 到 legacy 本地存储`

## 2. 当前前端接入范围

已切换到 `transaction-repository` 的页面：

- `pages/checkout/index`
- `pages/orders/index`
- `pages/order-detail/index`
- `pages/favorites/index`
- `pages/creator-detail/index`
- `pages/destination-detail/index`
- `pages/idea-detail/index`
- `pages/service-detail/index`
- `pages/profile/index`

## 3. 交易集合约定

### 3.1 orders

建议字段：

- `id`
- `orderNo`
- `shortId`
- `openid`
- `serviceSlug`
- `serviceName`
- `cover`
- `serviceType`
- `amount`
- `discount`
- `payable`
- `peopleCount`
- `travelDate`
- `traveler`
- `travelers`
- `note`
- `status`
- `createdAt`
- `createdAtText`

说明：

- `createdAt` 建议保存时间戳，便于排序。
- `createdAtText` 保存可直接展示的字符串，减少前端格式化差异。
- `serviceName/cover/serviceType` 当前按快照方式存储，避免后续服务内容变更影响已生成订单。

### 3.2 favorites

建议字段：

- `openid`
- `targetType`
- `targetSlug`
- `createdAt`

说明：

- 当前收藏按 `slug` 关联内容域对象。
- `targetType` 允许值：
  - `destinations`
  - `creators`
  - `services`
  - `ideas`

## 4. transactionGateway 已支持的 action

- `getOrders`
- `getRecentOrders`
- `getOrderById`
- `createOrder`
- `cancelOrder`
- `payOrder`
- `getFavoriteState`
- `isFavorited`
- `toggleFavorite`
- `getFavoritesPageData`

## 5. 当前身份边界

当前项目仍保留本地模拟登录 UI：

- `services/user.js` 中的 `simulateWechatLogin`

但交易网关使用的是微信云函数上下文中的 `OPENID`：

- 订单和收藏数据按 `OPENID` 隔离
- 即使前端仍用本地模拟登录控制页面态，交易数据已经具备云端按用户隔离的能力

这意味着当前处于“UI 登录未完全真实化，但交易数据已经真实云端化”的过渡阶段。

## 6. 当前 fallback 行为

如果出现以下情况，前端会自动回退到 legacy 本地实现：

- `transactionGateway` 未部署
- 云调用失败
- 云环境权限或集合异常

因此本地开发和渐进切换不会被阻塞。

## 7. 下一步建议

进入下一阶段前，建议优先处理两件事：

1. 将 `simulateWechatLogin` 迁移为真实微信登录链路
2. 补充用户集合和用户中心数据读取，使“我的”页不再依赖本地模拟状态

这会自然衔接到下一阶段的用户中心改造。
