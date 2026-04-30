const test = require("node:test");
const assert = require("node:assert/strict");

const { buildArticleBridgeSrc } = require("../miniprogram/pkg/content/article-bridge/bridge");

test("article bridge uses configured business-domain page when provided", () => {
  const result = buildArticleBridgeSrc({
    target: "https://mp.weixin.qq.com/s/example",
    title: "魔都看展合集",
    bridgeBaseUrl: "https://yezai.example.com/article-bridge/index.html"
  });

  assert.equal(
    result,
    "https://yezai.example.com/article-bridge/index.html?target=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fexample&title=%E9%AD%94%E9%83%BD%E7%9C%8B%E5%B1%95%E5%90%88%E9%9B%86"
  );
});

test("article bridge falls back to direct article url when no bridge page is configured", () => {
  const result = buildArticleBridgeSrc({
    target: "https://mp.weixin.qq.com/s/example",
    bridgeBaseUrl: ""
  });

  assert.equal(result, "https://mp.weixin.qq.com/s/example");
});
