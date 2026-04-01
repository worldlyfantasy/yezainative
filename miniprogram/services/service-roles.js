function getServiceCreatorRoles(service = {}) {
  const customRoles = Array.isArray(service.creatorRoles)
    ? service.creatorRoles.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const serviceType = String(service.type || "").trim();

  if (customRoles.length) {
    return customRoles;
  }

  if (serviceType === "带团旅行") {
    return ["创作者", "带领者"];
  }

  if (serviceType === "定制规划") {
    return ["创作者", "策划者"];
  }

  if (["在地体验", "短途旅行", "长途旅行", "国际旅行"].includes(serviceType)) {
    return ["创作者", "带领者"];
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
