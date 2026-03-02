const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {

  const { OPENID } = cloud.getWXContext()
  const users = db.collection('users')

  try {

    // 尝试查找用户
    const userResult = await users.where({
      openid: OPENID
    }).limit(1).get()

    // 如果不存在 → 创建用户
    if (userResult.data.length === 0) {

      await users.add({
        data: {
          openid: OPENID,
          role: 'user',       // 用户角色
          nickname: '',
          avatar: '',
          creatorProfile: null,
          createdAt: new Date()
        }
      })

      return { newUser: true }
    }

    return { newUser: false }

  } catch (err) {

    // 关键：如果集合不存在 → 先创建第一条数据
    if (err.errCode === -502005 || err.errCode === -501000) {

      await users.add({
        data: {
          openid: OPENID,
          role: 'user',
          nickname: '',
          avatar: '',
          creatorProfile: null,
          createdAt: new Date()
        }
      })

      return { newUser: true, initialized: true }
    }

    throw err
  }
}
