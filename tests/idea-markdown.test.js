const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseIdeaBody,
  renderIdeaBodyRichText
} = require("../miniprogram/pkg/content/utils/content");

test("idea body parser recognizes headings, quotes, paragraphs and horizontal rules", () => {
  assert.deepEqual(
    parseIdeaBody("### 先认识风向\n\n码头的风，总是主导一切。\n下车的第一件事，不是前行，而是**站进风里**。\n\n> 风从哪里来\n> 要把你推向哪里？\n\n---"),
    [
      {
        id: "block-0",
        type: "heading",
        level: 3,
        content: "先认识风向"
      },
      {
        id: "block-1",
        type: "paragraph",
        content: "码头的风，总是主导一切。\n下车的第一件事，不是前行，而是**站进风里**。"
      },
      {
        id: "block-2",
        type: "quote",
        content: "风从哪里来\n要把你推向哪里？"
      },
      {
        id: "block-3",
        type: "hr",
        content: ""
      }
    ]
  );
});

test("idea body parser recognizes images and list blocks", () => {
  assert.deepEqual(
    parseIdeaBody("![码头晨雾](https://example.com/wharf.jpg)\n\n- 顺风走\n- 逆风停\n\n1. 记风\n2. 再出发"),
    [
      {
        id: "block-0",
        type: "image",
        alt: "码头晨雾",
        src: "https://example.com/wharf.jpg"
      },
      {
        id: "block-1",
        type: "unordered-list",
        items: ["顺风走", "逆风停"]
      },
      {
        id: "block-2",
        type: "ordered-list",
        items: ["记风", "再出发"]
      }
    ]
  );
});

test("idea body rich text renderer converts inline bold, line breaks and rules to rich-text html", () => {
  const html = renderIdeaBodyRichText("### 先认识风向\n\n码头的风，总是主导一切。\n下车的第一件事，而是**站进风里**。\n\n> 风从哪里来，要把你推向哪里？\n\n---");

  assert.match(html, /<h3[^>]*>先认识风向<\/h3>/);
  assert.match(html, /码头的风，总是主导一切。<br\/>下车的第一件事，而是<strong[^>]*>站进风里<\/strong>。/);
  assert.match(html, /<blockquote[^>]*>风从哪里来，要把你推向哪里？<\/blockquote>/);
  assert.match(html, /<hr[^>]*\/>/);
  assert.doesNotMatch(html, /text-indent/);
});

test("idea body rich text renderer supports italic, links, images and lists", () => {
  const html = renderIdeaBodyRichText("*慢一点*，看[潮水](https://example.com/tide)。\n\n![潮线](https://example.com/tide.jpg)\n\n- 先看风\n- 再听潮");

  assert.match(html, /<em[^>]*>慢一点<\/em>/);
  assert.match(html, /<a href="https:\/\/example.com\/tide"[^>]*>潮水<\/a>/);
  assert.match(html, /<img src="https:\/\/example.com\/tide.jpg" alt="潮线"[^>]*>/);
  assert.match(html, /<ul[^>]*><li[^>]*>先看风<\/li><li[^>]*>再听潮<\/li><\/ul>/);
});

test("idea body rich text renderer escapes raw html", () => {
  const html = renderIdeaBodyRichText("<script>alert('xss')</script>");

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(&#39;xss&#39;\)&lt;\/script&gt;/);
});
