function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function mapUser(payload) {
  if (!payload) {
    return null;
  }

  const source = ensureObject(payload);
  return {
    id: source.id || "",
    nickname: source.nickname || "旅人",
    avatarUrl: source.avatarUrl || "",
    memberLabel: source.memberLabel || "野哉会员",
    role: source.role || "user"
  };
}

module.exports = {
  mapUser
};
