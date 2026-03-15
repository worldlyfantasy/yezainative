# Phase 4: 用户网关与用户中心约定

## 1. 本阶段新增内容

本阶段新增：

- `cloudfunctions/userGateway`
- `miniprogram/api/cloud/user.js`
- `miniprogram/repositories/user-repository.js`

并将用户中心从“本地模拟用户”改造成：

- 云端真实用户资料
- 本地轻量 session/cache
- 页面按用户主动登录行为切换状态

## 2. 当前登录态策略

当前不是“无感自动登录”，而是保留了原有产品行为：

1. 用户点击“微信登录”
2. 前端尝试获取微信头像昵称
3. 调用 `userGateway.login`
4. 云端写入或更新 `users` 集合
5. 本地仅保存：
   - 当前用户缓存
   - 一个 session 标记

用户点击“退出”时：

- 清除本地 session
- 清除本地用户缓存
- 不删除云端用户记录

这符合当前小程序阶段的产品体验，也避免把“云函数可拿 OPENID”误当成“用户已授权登录”。

## 3. users 集合约定

建议字段：

- `openid`
- `nickname`
- `avatarUrl`
- `memberLabel`
- `role`
- `createdAt`
- `updatedAt`

当前 `userGateway` 已使用这些字段。

## 4. userGateway 已支持的 action

- `getCurrentUser`
- `login`

说明：

- `getCurrentUser` 按云函数上下文 `OPENID` 查询用户
- `login` 会按 `OPENID` upsert 用户资料

## 5. 前端当前接入范围

已接入用户仓储的入口：

- `pages/profile/index`
- `pages/favorites/index`
- `services/user.js`

用户中心聚合逻辑仍在 `services/user.js`，但用户资料来源已改为 `user-repository`。

## 6. 当前仍保留的本地数据

当前仍保留本地缓存，但职责已经缩小：

- `yezai_user_profile`
- `yezai_user_session`

这两个 key 不再是“业务真相”，只是前端会话缓存。

真实用户资料以云端 `users` 集合为准。

## 7. 当前与前一阶段的衔接关系

Phase 3 中：

- 订单和收藏已按 `OPENID` 云端隔离

Phase 4 中：

- 用户资料和用户中心页面已开始按同一 `OPENID` 读取

因此现在的数据关系已经统一：

- 用户资料：`users`
- 订单：`orders`
- 收藏：`favorites`

它们都围绕 `OPENID` 工作。

## 8. 下一步建议

如果继续推进，下一阶段建议做的是：

1. 清理旧的 legacy 服务入口，减少重复逻辑
2. 为云环境补一份初始化脚本或导入脚本
3. 在微信开发者工具里完成真实联调：
   - 登录
   - 收藏
   - 提交报名
   - 订单查询

到这个阶段，项目已经基本完成从“前端大量 mock + 本地状态”向“云端内容、云端配置、云端交易、云端用户”的结构迁移。
