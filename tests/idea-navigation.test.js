const test = require("node:test");
const assert = require("node:assert/strict");

const { openIdea } = require("../miniprogram/services/idea-navigation");

test("idea navigation sends wechat mode directly to article bridge web-view", () => {
  const calls = [];
  global.wx = {
    navigateTo(options) {
      calls.push(options);
    }
  };

  try {
    openIdea({
      slug: "chengdu-notes",
      sourceType: "wechat",
      wechatArticleUrl: "https://mp.weixin.qq.com/s/example",
      wechatArticleTitle: "成都看展合集",
      title: "成都看展合集"
    });
  } finally {
    delete global.wx;
  }

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "/pkg/content/article-bridge/index?target=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fexample&title=%E6%88%90%E9%83%BD%E7%9C%8B%E5%B1%95%E5%90%88%E9%9B%86"
  );
});

test("idea navigation keeps hybrid mode inside miniapp detail page", () => {
  const calls = [];
  global.wx = {
    navigateTo(options) {
      calls.push(options);
    }
  };

  try {
    openIdea({
      slug: "chengdu-notes",
      sourceType: "hybrid",
      wechatArticleUrl: "https://mp.weixin.qq.com/s/example"
    });
  } finally {
    delete global.wx;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/pkg/content/idea-detail/index?slug=chengdu-notes");
});
