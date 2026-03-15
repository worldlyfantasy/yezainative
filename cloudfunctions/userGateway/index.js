const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS_COLLECTION = "users";
const USER_AVATAR_FOLDER = "/user_avatar/";

function getStoredNickname(doc) {
  return String((doc && doc.nickname) || "").trim();
}

function getStoredAvatarUrl(doc) {
  return String((doc && (doc.avatarUrl || doc.avatar)) || "").trim();
}

function isNicknameConfigured(doc) {
  const nickname = getStoredNickname(doc);
  return Boolean(nickname && nickname !== "微信用户");
}

function isAvatarConfigured(doc) {
  return Boolean(getStoredAvatarUrl(doc));
}

function isProfileConfigured(doc) {
  if (!doc) {
    return false;
  }

  return Boolean(doc.profileConfigured) || Boolean(doc.profileCompletedAt) || (isNicknameConfigured(doc) && isAvatarConfigured(doc));
}

function shouldDeletePreviousAvatar(previousAvatarUrl, nextAvatarUrl) {
  const previous = String(previousAvatarUrl || "").trim();
  const next = String(nextAvatarUrl || "").trim();

  return Boolean(previous && previous !== next && previous.startsWith("cloud://") && previous.includes(USER_AVATAR_FOLDER));
}

async function deletePreviousAvatar(previousAvatarUrl, nextAvatarUrl) {
  if (!shouldDeletePreviousAvatar(previousAvatarUrl, nextAvatarUrl)) {
    return;
  }

  try {
    await cloud.deleteFile({
      fileList: [previousAvatarUrl]
    });
  } catch (error) {
    console.error("Failed to delete previous avatar", {
      error,
      previousAvatarUrl,
      nextAvatarUrl
    });
  }
}

function normalizeUser(doc) {
  if (!doc) {
    return null;
  }

  const nickname = getStoredNickname(doc);

  return {
    id: doc._id || "",
    nickname: nickname && nickname !== "微信用户" ? nickname : "旅人",
    avatarUrl: getStoredAvatarUrl(doc),
    memberLabel: doc.memberLabel || "野哉会员",
    role: doc.role || "user",
    profileConfigured: isProfileConfigured(doc)
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
  const nickname = String(normalizedProfile.nickName || "").trim();
  const avatarUrl = String(normalizedProfile.avatarUrl || "").trim();
  const existingNickname = getStoredNickname(existing);
  const existingAvatarUrl = getStoredAvatarUrl(existing);
  const nextData = {
    openid: OPENID,
    role: existing && existing.role ? existing.role : "user",
    nickname: nickname && nickname !== "微信用户" ? nickname : existingNickname || "旅人",
    avatarUrl: avatarUrl || existingAvatarUrl || "",
    memberLabel: existing && existing.memberLabel ? existing.memberLabel : "野哉会员",
    profileConfigured: isProfileConfigured(existing),
    profileCompletedAt: existing && existing.profileCompletedAt ? existing.profileCompletedAt : null,
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

async function updateProfile(profile) {
  const { OPENID } = cloud.getWXContext();
  const normalizedProfile = profile || {};
  const existing = await findUserByOpenId(OPENID);
  const nickname = String(normalizedProfile.nickname || normalizedProfile.nickName || "").trim();
  const avatarUrl = String(normalizedProfile.avatarUrl || "").trim();
  const existingNickname = getStoredNickname(existing);
  const existingAvatarUrl = getStoredAvatarUrl(existing);
  const nextNickname = nickname && nickname !== "微信用户" ? nickname : existingNickname || "旅人";
  const nextAvatarUrl = avatarUrl || existingAvatarUrl || "";
  const profileConfigured = Boolean((nickname && nickname !== "微信用户" ? nickname : existingNickname) && nextAvatarUrl);
  const nextData = {
    openid: OPENID,
    role: existing && existing.role ? existing.role : "user",
    nickname: nextNickname,
    avatarUrl: nextAvatarUrl,
    memberLabel: existing && existing.memberLabel ? existing.memberLabel : "野哉会员",
    profileConfigured,
    profileCompletedAt: profileConfigured ? Date.now() : existing && existing.profileCompletedAt ? existing.profileCompletedAt : null,
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

  await deletePreviousAvatar(existingAvatarUrl, nextAvatarUrl);

  return normalizeUser(Object.assign({}, existing, nextData));
}

const handlers = {
  getCurrentUser: () => getCurrentUser(),
  login: (payload) => login(payload.profile),
  updateProfile: (payload) => updateProfile(payload.profile)
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
