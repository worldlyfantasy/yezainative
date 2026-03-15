const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS_COLLECTION = "users";

function normalizeUser(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: doc._id || "",
    nickname: doc.nickname || "旅人",
    avatarUrl: doc.avatarUrl || doc.avatar || "",
    memberLabel: doc.memberLabel || "野哉会员",
    role: doc.role || "user"
  };
}

async function findUserByOpenId(openid) {
  const result = await db.collection(USERS_COLLECTION).where({ openid }).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function getCurrentUser() {
  const { OPENID } = cloud.getWXContext();
  const user = await findUserByOpenId(OPENID);
  return normalizeUser(user);
}

async function login(profile) {
  const { OPENID } = cloud.getWXContext();
  const normalizedProfile = profile || {};
  const existing = await findUserByOpenId(OPENID);
  const nextData = {
    openid: OPENID,
    role: existing && existing.role ? existing.role : "user",
    nickname: normalizedProfile.nickName || (existing && existing.nickname) || "旅人",
    avatarUrl: normalizedProfile.avatarUrl || (existing && (existing.avatarUrl || existing.avatar)) || "",
    memberLabel: existing && existing.memberLabel ? existing.memberLabel : "野哉会员",
    updatedAt: Date.now()
  };

  if (!existing) {
    const createResult = await db.collection(USERS_COLLECTION).add({
      data: Object.assign({}, nextData, {
        createdAt: Date.now()
      })
    });

    return normalizeUser(Object.assign({ _id: createResult._id }, nextData));
  }

  await db.collection(USERS_COLLECTION).doc(existing._id).update({
    data: nextData
  });

  return normalizeUser(Object.assign({}, existing, nextData));
}

const handlers = {
  getCurrentUser: () => getCurrentUser(),
  login: (payload) => login(payload.profile)
};

exports.main = async (event) => {
  const action = event && event.action;
  const payload = event && event.payload ? event.payload : {};
  const handler = handlers[action];

  if (!handler) {
    return {
      ok: false,
      error: `Unsupported action: ${action || ""}`
    };
  }

  try {
    const data = await handler(payload);
    return {
      ok: true,
      data
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "User gateway error"
    };
  }
};
