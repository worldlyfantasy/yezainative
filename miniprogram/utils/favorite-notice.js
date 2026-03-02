function clearFavoriteNotice(page, key = "favoriteNoticeState", skipUpdate = false) {
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
    nextData[key] = "";
    page.setData(nextData);
  }
}

function showFavoriteNotice(page, key = "favoriteNoticeState") {
  clearFavoriteNotice(page, key);

  const nextData = {};
  nextData[key] = "visible";
  page.setData(nextData);

  page.__favoriteNoticeFadeTimer = setTimeout(() => {
    const fadeData = {};
    fadeData[key] = "leaving";
    page.setData(fadeData);
  }, 4200);

  page.__favoriteNoticeHideTimer = setTimeout(() => {
    const hideData = {};
    hideData[key] = "";
    page.setData(hideData);
    page.__favoriteNoticeFadeTimer = null;
    page.__favoriteNoticeHideTimer = null;
  }, 5000);
}

module.exports = {
  clearFavoriteNotice,
  showFavoriteNotice
};
