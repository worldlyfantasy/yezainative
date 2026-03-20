function resolveNoticeOptions(keyOrOptions, extraOptions) {
  const baseOptions = {
    stateKey: "favoriteNoticeState",
    labelKey: "favoriteNoticeLabel",
    actionLabelKey: "favoriteNoticeActionLabel",
    modeKey: "favoriteNoticeMode",
    actionTypeKey: "favoriteNoticeActionType",
    label: "收藏成功",
    actionLabel: "进入我的收藏",
    mode: "success",
    actionType: "favorites"
  };

  if (typeof keyOrOptions === "string") {
    return Object.assign({}, baseOptions, {
      stateKey: keyOrOptions
    }, extraOptions || {});
  }

  return Object.assign({}, baseOptions, keyOrOptions || {});
}

function clearFavoriteNotice(page, keyOrOptions = "favoriteNoticeState", skipUpdate = false) {
  const options = resolveNoticeOptions(keyOrOptions);
  if (page.__favoriteNoticeFadeTimer) {
    clearTimeout(page.__favoriteNoticeFadeTimer);
    page.__favoriteNoticeFadeTimer = null;
  }

  if (page.__favoriteNoticeHideTimer) {
    clearTimeout(page.__favoriteNoticeHideTimer);
    page.__favoriteNoticeHideTimer = null;
  }

  if (!skipUpdate) {
    const nextData = {};
    nextData[options.stateKey] = "";
    page.setData(nextData);
  }
}

function showFavoriteNotice(page, keyOrOptions = "favoriteNoticeState", extraOptions) {
  const options = resolveNoticeOptions(keyOrOptions, extraOptions);
  clearFavoriteNotice(page, options);

  const nextData = {};
  nextData[options.stateKey] = "visible";
  nextData[options.labelKey] = options.label;
  nextData[options.actionLabelKey] = options.actionLabel;
  nextData[options.modeKey] = options.mode;
  nextData[options.actionTypeKey] = options.actionType;
  page.setData(nextData);

  page.__favoriteNoticeFadeTimer = setTimeout(() => {
    const fadeData = {};
    fadeData[options.stateKey] = "leaving";
    page.setData(fadeData);
  }, 4200);

  page.__favoriteNoticeHideTimer = setTimeout(() => {
    const hideData = {};
    hideData[options.stateKey] = "";
    page.setData(hideData);
    page.__favoriteNoticeFadeTimer = null;
    page.__favoriteNoticeHideTimer = null;
  }, 5000);
}

module.exports = {
  clearFavoriteNotice,
  showFavoriteNotice
};
