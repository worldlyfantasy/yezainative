function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeNickname(value) {
  const nickname = String(value || "").trim();
  if (!nickname || nickname === "微信用户") {
    return "旅人";
  }

  return nickname;
}

function mapUser(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    id: source.id || "",
    nickname: normalizeNickname(source.nickname),
    avatarUrl: source.avatarUrl || "",
    memberLabel: source.memberLabel || "野哉会员",
    role: source.role || "user",
    profileConfigured: Boolean(source.profileConfigured),
    travelerCount: Number(source.travelerCount) || 0,
    effectiveOrderCount: Number(source.effectiveOrderCount) || 0,
    effectiveRouteCount: Number(source.effectiveRouteCount) || 0,
    lastTravelAt: Number(source.lastTravelAt) || 0
  };
}

module.exports = {
  mapUser
};
