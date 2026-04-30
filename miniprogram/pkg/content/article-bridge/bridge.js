function isExternalHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function buildArticleBridgeSrc(options) {
  const source = options && typeof options === "object" ? options : {};
  const target = String(source.target || "").trim();
  const title = String(source.title || "").trim();
  const bridgeBaseUrl = String(source.bridgeBaseUrl || "").trim();

  if (!isExternalHttpUrl(target)) {
    return "";
  }

  if (!isExternalHttpUrl(bridgeBaseUrl)) {
    return target;
  }

  const joiner = bridgeBaseUrl.indexOf("?") === -1 ? "?" : "&";
  const query = [`target=${encodeURIComponent(target)}`];

  if (title) {
    query.push(`title=${encodeURIComponent(title)}`);
  }

  return `${bridgeBaseUrl}${joiner}${query.join("&")}`;
}

module.exports = {
  isExternalHttpUrl,
  buildArticleBridgeSrc
};
