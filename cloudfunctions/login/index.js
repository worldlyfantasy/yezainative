const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const users = db.collection("users");

  try {
    const userResult = await users.where({ openid: OPENID }).limit(1).get();

    if (userResult.data.length === 0) {
      const now = Date.now();
      await users.add({
        data: {
          openid: OPENID,
          role: "user",
          nickname: "旅人",
          avatarUrl: "",
          avatar: "",
          memberLabel: "野哉会员",
          profileConfigured: false,
          profileCompletedAt: null,
          creatorProfile: null,
          createdAt: now,
          updatedAt: now
        },
      });
      return { newUser: true };
    }

    return { newUser: false };
  } catch (err) {
    if (err.errCode === -502005 || err.errCode === -501000) {
      const now = Date.now();
      await users.add({
        data: {
          openid: OPENID,
          role: "user",
          nickname: "旅人",
          avatarUrl: "",
          avatar: "",
          memberLabel: "野哉会员",
          profileConfigured: false,
          profileCompletedAt: null,
          creatorProfile: null,
          createdAt: now,
          updatedAt: now
        },
      });
      return { newUser: true, initialized: true };
    }

    throw err;
  }
};
