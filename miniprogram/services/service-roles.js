function getServiceCreatorRoles(service = {}) {
  const customRoles = Array.isArray(service.creatorRoles)
    ? service.creatorRoles.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (customRoles.length) {
    return customRoles;
  }

  if (service.type === "带团旅行") {
    return ["创作者", "带领者"];
  }

  if (service.type === "定制规划") {
    return ["创作者", "策划者"];
  }

  return ["创作者"];
}

function getServiceCreatorRoleText(service, separator = " · ") {
  return getServiceCreatorRoles(service).join(separator);
}

module.exports = {
  getServiceCreatorRoles,
  getServiceCreatorRoleText
};
