# 正式上线前验收清单

## 1. 环境验收

- 微信云开发环境 ID 与 [app.js](/Users/lihaisen/Desktop/code/migrate/yezainative/miniprogram/app.js) 中配置一致
- `creators/destinations/services/ideas/app_configs/users/orders/favorites` 八个集合已创建
- 四个云函数 `userGateway/contentGateway/configGateway/transactionGateway` 已部署
- 每个云函数依赖已安装，可用 `node scripts/install-cloudfunctions-deps.js` 统一安装
- [cloud-seed](/Users/lihaisen/Desktop/code/migrate/yezainative/docs/cloud-seed) 初始化数据已导入内容与配置集合

## 2. 内容与配置验收

- 首页能正常读取 banner、精选创作者、精选目的地、精选故事
- 创作者列表与详情页可正常打开，目的地、服务、故事关联关系正确
- 目的地列表与详情页筛选正常，服务卡片有正确的创作者名
- 服务详情页的 `travelDetail/groupPeriods/mediaTabs` 显示正常
- `how-it-works`、报名协议、结果页文案、订单详情文案均来自配置集合，不再依赖页面硬编码

## 3. 用户与交易验收

- “我的”页面点击登录后，`users` 集合会新增或更新当前 `OPENID` 对应记录
- 退出登录后，页面回到未登录态；再次登录后仍能读回该用户数据
- 收藏/取消收藏后，详情页、列表页、收藏页状态一致
- 提交报名后，`TravelOrder` SQL 模型新增记录，订单列表与订单详情可正常读取
- 下单时金额以服务端结算为准，客户端传入 `discount` 不会改变最终应付金额
- 订单取消、订单确认等状态流转符合预期
- `transactionGateway.payOrder` 在默认配置下返回禁用错误；仅在明确联调时才临时开启 `ENABLE_CLIENT_PAY_ORDER=true`

## 4. 回退与异常验收

- 云函数不可用时，内容、配置、交易、用户页面不会直接崩溃
- 云函数恢复后，页面能重新读取云端数据，不出现脏缓存长期滞留
- 集合为空或缺字段时，页面有空态或兜底文案，不出现白屏
- 登录授权失败、报名提交失败、收藏失败时，页面有明确提示

## 5. 发布前清理

- 不提交任何 `node_modules`
- legacy fallback 与本地订单/收藏旧实现已移除，不再保留离线数据回退
- 保留 [phase-5-cutover-checklist.md](/Users/lihaisen/Desktop/code/migrate/yezainative/docs/phase-5-cutover-checklist.md) 作为切换执行手册
- 保留 [install-cloudfunctions-deps.js](/Users/lihaisen/Desktop/code/migrate/yezainative/scripts/install-cloudfunctions-deps.js) 作为依赖安装脚本，初始化数据使用 [cloud-seed](/Users/lihaisen/Desktop/code/migrate/yezainative/docs/cloud-seed)
