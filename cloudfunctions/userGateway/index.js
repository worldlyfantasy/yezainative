const crypto = require("crypto");
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const USERS_COLLECTION = "users";
const USER_TRAVELERS_COLLECTION = "user_travelers";
const USER_AVATAR_FOLDER = "/user_avatar/";
const MAX_TRAVELER_COUNT = 12;
const MAX_TRAVELER_DOCUMENT_ROWS = 5;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) {
    return normalized;
  }
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function maskIdNumber(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (normalized.length <= 6) {
    return normalized;
  }
  return `${normalized.slice(0, 3)}***${normalized.slice(-3)}`;
}

function normalizeTravelerDocuments(documents) {
  return (Array.isArray(documents) ? documents : [])
    .map((row) => ({
      documentType: normalizeText(row && row.documentType),
      documentNumber: normalizeText(row && row.documentNumber)
    }))
    .filter((row) => row.documentType && row.documentNumber)
    .slice(0, MAX_TRAVELER_DOCUMENT_ROWS);
}

function buildTravelerDedupeKey(payload) {
  const documents = normalizeTravelerDocuments(payload && payload.documents)
    .map((row) => `${row.documentType}:${row.documentNumber}`)
    .sort();
  const raw = JSON.stringify({
    name: normalizeText(payload && payload.name),
    phone: normalizePhone(payload && payload.phone),
    gender: normalizeText(payload && payload.gender),
    birthday: normalizeText(payload && payload.birthday),
    wechat: normalizeText(payload && payload.wechat),
    email: normalizeText(payload && payload.email),
    idType: normalizeText(payload && payload.idType),
    idNumber: normalizeText(payload && payload.idNumber),
    documents
  });
  return crypto.createHash("sha1").update(raw).digest("hex");
}

function getTravelerDedupeKey(doc) {
  return normalizeText(doc && doc.dedupeKey) || buildTravelerDedupeKey(doc);
}

function inferPrimaryDocument(documents) {
  const first = Array.isArray(documents) && documents.length ? documents[0] : null;
  return {
    idType: normalizeText(first && first.documentType),
    idNumber: normalizeText(first && first.documentNumber)
  };
}

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
    profileConfigured: isProfileConfigured(doc),
    travelerCount: Number(doc.travelerCount) || 0,
    effectiveOrderCount: Number(doc.effectiveOrderCount) || 0,
    effectiveRouteCount: Number(doc.effectiveRouteCount) || 0,
    lastTravelAt: Number(doc.lastTravelAt) || 0
  };
}

async function findUserByOpenId(openid) {
  const result = await db.collection(USERS_COLLECTION).where({ openid }).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function ensureCurrentUserDoc() {
  const { OPENID } = cloud.getWXContext();
  let user = await findUserByOpenId(OPENID);

  if (!user) {
    const now = Date.now();
    const createResult = await db.collection(USERS_COLLECTION).add({
      data: {
        openid: OPENID,
        role: "user",
        nickname: "旅人",
        avatarUrl: "",
        memberLabel: "野哉会员",
        profileConfigured: false,
        profileCompletedAt: null,
        travelerCount: 0,
        effectiveOrderCount: 0,
        effectiveRouteCount: 0,
        lastTravelAt: 0,
        createdAt: now,
        updatedAt: now
      }
    });
    user = await findUserByOpenId(OPENID);
    if (!user) {
      user = {
        _id: createResult && createResult._id ? createResult._id : "",
        openid: OPENID,
        role: "user",
        nickname: "旅人",
        avatarUrl: "",
        memberLabel: "野哉会员",
        profileConfigured: false,
        profileCompletedAt: null,
        travelerCount: 0,
        effectiveOrderCount: 0,
        effectiveRouteCount: 0,
        lastTravelAt: 0,
        createdAt: now,
        updatedAt: now
      };
    }
  }

  return user;
}

async function updateUserTravelerCount(userDoc, count) {
  if (!userDoc || !userDoc._id) {
    return;
  }

  await db.collection(USERS_COLLECTION).doc(userDoc._id).update({
    data: {
      travelerCount: Math.max(0, Number(count) || 0),
      updatedAt: Date.now()
    }
  });
}

async function getActiveTravelerCount(userOpenid) {
  const result = await db.collection(USER_TRAVELERS_COLLECTION)
    .where({
      userOpenid,
      status: "active",
      source: "traveler_profile"
    })
    .limit(MAX_TRAVELER_COUNT)
    .get();
  return result && result.data ? result.data.length : 0;
}

function normalizeTravelerForWrite(profile, existingDoc, openid, userId) {
  const documents = normalizeTravelerDocuments(profile && profile.documents);
  const primaryDocument = inferPrimaryDocument(documents);
  const directDocumentType = normalizeText(profile && profile.documentType);
  const directDocumentNumber = normalizeText(
    (profile && profile.documentNumber)
    || (profile && profile.idCard)
    || (profile && profile.idNumber)
  );
  const resolvedIdType = primaryDocument.idType || directDocumentType || normalizeText(existingDoc && existingDoc.idType);
  const resolvedIdNumber = primaryDocument.idNumber || directDocumentNumber || normalizeText(existingDoc && existingDoc.idNumber);
  const now = Date.now();
  const profileId = normalizeText(profile && profile.profileId) || normalizeText(existingDoc && existingDoc.profileId)
    || `p_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const travelerId = normalizeText(existingDoc && existingDoc.travelerId) || profileId;
  const name = normalizeText(profile && profile.name);
  const phone = normalizePhone(profile && profile.phone);
  const wechat = normalizeText(profile && profile.wechat);
  const email = normalizeText(profile && profile.email);
  const gender = normalizeText(profile && profile.gender);
  const birthday = normalizeText(profile && profile.birthday);
  const note = normalizeText(profile && profile.note);
  const source = normalizeText(profile && profile.source) || normalizeText(existingDoc && existingDoc.source) || "traveler_profile";
  const status = normalizeText(profile && profile.status) || normalizeText(existingDoc && existingDoc.status) || "active";
  const dedupeKey = buildTravelerDedupeKey({
    name,
    phone,
    gender,
    birthday,
    wechat,
    email,
    idType: resolvedIdType,
    idNumber: resolvedIdNumber,
    documents
  });
  return {
    travelerId,
    profileId,
    dedupeKey,
    userOpenid: openid,
    userId: normalizeText(userId),
    name,
    phone,
    phoneMasked: maskPhone(phone),
    idType: resolvedIdType,
    idNumber: resolvedIdNumber,
    idNumberMasked: maskIdNumber(resolvedIdNumber),
    gender,
    birthday,
    wechat,
    email,
    note,
    documents,
    status: status || "active",
    source,
    version: Number(existingDoc && existingDoc.version) > 0 ? Number(existingDoc.version) + 1 : 1,
    lastUsedAt: Number(profile && profile.lastUsedAt) > 0 ? Number(profile.lastUsedAt) : now,
    createdAt: Number(existingDoc && existingDoc.createdAt) || now,
    updatedAt: now,
    createdByOpenid: normalizeText(existingDoc && existingDoc.createdByOpenid) || openid,
    updatedByOpenid: openid
  };
}

function mapTravelerForClient(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: normalizeText(doc._id),
    travelerRecordId: normalizeText(doc._id),
    travelerId: normalizeText(doc.travelerId || doc.profileId),
    profileId: normalizeText(doc.profileId || doc.travelerId),
    name: normalizeText(doc.name),
    phone: normalizePhone(doc.phone),
    phoneMasked: normalizeText(doc.phoneMasked) || maskPhone(doc.phone),
    documents: normalizeTravelerDocuments(doc.documents),
    gender: normalizeText(doc.gender),
    birthday: normalizeText(doc.birthday),
    wechat: normalizeText(doc.wechat),
    email: normalizeText(doc.email),
    note: normalizeText(doc.note),
    idType: normalizeText(doc.idType),
    idNumberMasked: normalizeText(doc.idNumberMasked) || maskIdNumber(doc.idNumber),
    status: normalizeText(doc.status) || "active",
    source: normalizeText(doc.source),
    version: Number(doc.version) || 1,
    lastUsedAt: Number(doc.lastUsedAt) || 0,
    createdAt: Number(doc.createdAt) || 0,
    updatedAt: Number(doc.updatedAt) || 0
  };
}

async function listTravelerProfiles() {
  const user = await ensureCurrentUserDoc();
  const result = await db.collection(USER_TRAVELERS_COLLECTION)
    .where({
      userOpenid: user.openid,
      status: "active",
      source: "traveler_profile"
    })
    .orderBy("updatedAt", "desc")
    .limit(MAX_TRAVELER_COUNT)
    .get();
  const travelers = (result && result.data ? result.data : [])
    .map(mapTravelerForClient)
    .filter(Boolean);

  await updateUserTravelerCount(user, travelers.length);
  return travelers;
}

async function collapseTravelerDuplicates(userOpenid, dedupeKey, updaterOpenid) {
  if (!dedupeKey) {
    return null;
  }
  const result = await db.collection(USER_TRAVELERS_COLLECTION)
    .where({
      userOpenid,
      source: "traveler_profile",
      dedupeKey
    })
    .limit(MAX_TRAVELER_COUNT)
    .get();
  const list = result && result.data ? result.data.slice() : [];
  if (!list.length) {
    return null;
  }
  list.sort((left, right) => {
    const leftIsActive = normalizeText(left && left.status) === "active" ? 0 : 1;
    const rightIsActive = normalizeText(right && right.status) === "active" ? 0 : 1;
    if (leftIsActive !== rightIsActive) {
      return leftIsActive - rightIsActive;
    }
    const leftCreatedAt = Number(left && left.createdAt) || 0;
    const rightCreatedAt = Number(right && right.createdAt) || 0;
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }
    return normalizeText(left && left._id).localeCompare(normalizeText(right && right._id));
  });
  const canonicalDoc = list[0];
  const now = Date.now();
  await Promise.all(
    list
      .filter((item) => normalizeText(item && item._id) && normalizeText(item && item._id) !== normalizeText(canonicalDoc && canonicalDoc._id))
      .map((item) => db.collection(USER_TRAVELERS_COLLECTION).doc(item._id).update({
        data: {
          status: "inactive",
          updatedAt: now,
          updatedByOpenid: updaterOpenid
        }
      }))
  );
  return canonicalDoc;
}

async function upsertTravelerProfile(profile) {
  const user = await ensureCurrentUserDoc();
  const profileId = normalizeText(profile && profile.profileId);
  const existingListResult = await db.collection(USER_TRAVELERS_COLLECTION)
    .where({
      userOpenid: user.openid,
      source: "traveler_profile"
    })
    .limit(MAX_TRAVELER_COUNT)
    .get();
  const existingList = existingListResult && existingListResult.data ? existingListResult.data : [];
  const existingDoc = profileId ? existingList.find((item) => normalizeText(item && item.profileId) === profileId) : null;
  const nextDoc = normalizeTravelerForWrite(profile, existingDoc, user.openid, user._id);
  const duplicateDoc = existingList.find((item) =>
    normalizeText(item && item._id) !== normalizeText(existingDoc && existingDoc._id)
      && getTravelerDedupeKey(item) === nextDoc.dedupeKey
  );

  if (!nextDoc.name || !nextDoc.phone) {
    throw new Error("出行人姓名和手机号必填");
  }

  let persistedDoc = nextDoc;
  if (existingDoc && existingDoc._id) {
    await db.collection(USER_TRAVELERS_COLLECTION).doc(existingDoc._id).update({
      data: {
        ...nextDoc,
        isDefault: _.remove()
      }
    });
    persistedDoc = Object.assign({}, nextDoc, { _id: existingDoc._id });
  } else if (duplicateDoc && duplicateDoc._id) {
    const mergedDoc = normalizeTravelerForWrite(profile, duplicateDoc, user.openid, user._id);
    await db.collection(USER_TRAVELERS_COLLECTION).doc(duplicateDoc._id).update({
      data: {
        ...mergedDoc,
        status: "active",
        isDefault: _.remove()
      }
    });
    persistedDoc = Object.assign({}, mergedDoc, { _id: duplicateDoc._id });
  } else {
    if (existingList.length >= MAX_TRAVELER_COUNT) {
      throw new Error("最多保存 12 位出行人");
    }
    const createResult = await db.collection(USER_TRAVELERS_COLLECTION).add({
      data: nextDoc
    });
    persistedDoc = Object.assign({}, nextDoc, {
      _id: createResult && createResult._id ? createResult._id : ""
    });
  }

  const canonicalDoc = await collapseTravelerDuplicates(user.openid, nextDoc.dedupeKey, user.openid);
  if (canonicalDoc && canonicalDoc._id) {
    persistedDoc = canonicalDoc;
  }

  const activeCount = await getActiveTravelerCount(user.openid);
  await updateUserTravelerCount(user, activeCount);

  return mapTravelerForClient(persistedDoc);
}

async function deleteTravelerProfile(payload) {
  const user = await ensureCurrentUserDoc();
  const profileId = normalizeText(payload && payload.profileId);
  if (!profileId) {
    throw new Error("缺少出行人标识");
  }

  const result = await db.collection(USER_TRAVELERS_COLLECTION)
    .where({
      userOpenid: user.openid,
      profileId,
      source: "traveler_profile"
    })
    .limit(1)
    .get();
  const existing = result && result.data && result.data.length ? result.data[0] : null;
  if (!existing || !existing._id) {
    return {
      profileId,
      removed: false
    };
  }

  await db.collection(USER_TRAVELERS_COLLECTION).doc(existing._id).update({
    data: {
      status: "inactive",
      updatedAt: Date.now(),
      updatedByOpenid: user.openid
    }
  });

  const activeResult = await db.collection(USER_TRAVELERS_COLLECTION)
    .where({
      userOpenid: user.openid,
      status: "active",
      source: "traveler_profile"
    })
    .limit(MAX_TRAVELER_COUNT)
    .get();
  const activeCount = activeResult && activeResult.data ? activeResult.data.length : 0;
  await updateUserTravelerCount(user, activeCount);

  return {
    profileId,
    removed: true
  };
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
  updateProfile: (payload) => updateProfile(payload.profile),
  listTravelerProfiles: () => listTravelerProfiles(),
  upsertTravelerProfile: (payload) => upsertTravelerProfile(payload && payload.profile),
  deleteTravelerProfile: (payload) => deleteTravelerProfile(payload)
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
