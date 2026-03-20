# Phase 5: 部署与切换 Checklist

## 1. 目标

本阶段不再新增业务结构，重点是把前面四个阶段的内容变成可部署、可初始化、可联调的交付物。

## 2. 已准备好的内容

当前仓库已具备：

- 内容网关：`cloudfunctions/contentGateway`
- 配置网关：`cloudfunctions/configGateway`
- 交易网关：`cloudfunctions/transactionGateway`
- 用户网关：`cloudfunctions/userGateway`

以及一个种子数据导出脚本：

- `scripts/export-cloud-seed.js`
- `scripts/install-cloudfunctions-deps.js`

## 3. 生成初始化数据

在仓库根目录执行：

```bash
node scripts/install-cloudfunctions-deps.js
node scripts/export-cloud-seed.js
```

执行后会生成：

- `docs/cloud-seed/creators.json`
- `docs/cloud-seed/destinations.json`
- `docs/cloud-seed/services.json`
- `docs/cloud-seed/ideas.json`
- `docs/cloud-seed/app_configs.json`
- `docs/cloud-seed/users.json`
- `docs/cloud-seed/orders.json`
- `docs/cloud-seed/favorites.json`

其中：

- 内容域和配置域可直接作为云数据库初始导入数据
- `users/orders/favorites` 初始为空

## 4. 云数据库集合

建议创建以下集合：

- `creators`
- `destinations`
- `services`
- `ideas`
- `app_configs`
- `users`
- `orders`
- `favorites`

## 5. 导入顺序

建议顺序：

1. `creators`
2. `destinations`
3. `services`
4. `ideas`
5. `app_configs`
6. `users`
7. `orders`
8. `favorites`

## 6. 云函数部署顺序

建议顺序：

1. `userGateway`
2. `contentGateway`
3. `configGateway`
4. `transactionGateway`

### 当前仓库内已完成

- 五个云函数目录都已执行过一次 `npm install`
- 已生成云端初始化数据目录 `docs/cloud-seed`

### 当前仍需人工完成

- 在微信开发者工具中导入云函数并部署到目标环境
- 在云开发控制台创建集合并导入 `docs/cloud-seed/*.json`
- 在真机或开发者工具中完成登录、报名、收藏的点击联调

当前环境内未发现 `miniprogram-ci` 或微信开发者工具命令行，因此这里无法直接替你执行发布动作。

## 7. 联调顺序

建议按下面顺序验证，问题最好不要混在一起查：

1. 用户登录
   - 进入“我的”
   - 点击微信登录
   - 确认 `users` 集合新增或更新记录

2. 内容页
   - 首页
   - 创作者列表/详情
   - 目的地列表/详情
   - 故事列表/详情
   - 服务详情

3. 配置页
   - how-it-works
   - 报名协议
   - 服务详情咨询面板
   - 报名结果页
   - 订单详情文案

4. 交易页
   - 提交报名
   - 订单列表
   - 订单详情
   - 收藏/取消收藏
   - 收藏页读取

## 8. 验收重点

重点确认以下问题：

- 云函数未部署时是否能正确 fallback
- 云函数部署后是否优先走云端
- 收藏状态是否能跨页面保持一致
- 提交报名后订单是否能在“我的订单”中看到
- 退出登录后“我的”和收藏页是否回到未登录态
- 再次登录后是否还能读到同一 `OPENID` 下的数据

## 9. 清理建议

当前轮清理已完成 legacy fallback 与本地订单/收藏旧实现移除。后续只需要继续关注页面兜底与云端数据完整性，不再保留离线 fallback。
