function isWechatRedirectIdea(idea) {
  const sourceType = String(idea && idea.sourceType ? idea.sourceType : "").trim();
  const articleUrl = String(idea && idea.wechatArticleUrl ? idea.wechatArticleUrl : "").trim();
  return sourceType === "wechat" && /^https?:\/\//i.test(articleUrl);
}

function openIdea(idea) {
  const normalizedIdea = idea && typeof idea === "object" ? idea : {};
  const slug = String(normalizedIdea.slug || "").trim();

  if (isWechatRedirectIdea(normalizedIdea)) {
    wx.navigateTo({
      url: `/pkg/content/article-bridge/index?target=${encodeURIComponent(normalizedIdea.wechatArticleUrl)}&title=${encodeURIComponent(normalizedIdea.wechatArticleTitle || normalizedIdea.title || "")}`
    });
    return;
  }

  if (!slug) {
    return;
  }

  wx.navigateTo({
    url: `/pkg/content/idea-detail/index?slug=${slug}`
  });
}

module.exports = {
  openIdea
};
