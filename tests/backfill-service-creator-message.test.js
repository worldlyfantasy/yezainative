const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const scriptModulePath = path.resolve(
  __dirname,
  "../scripts/backfill-service-creator-message.js"
);
const {
  DEFAULT_CREATOR_MESSAGE,
  buildServiceUpdatePlan,
  deriveCreatorMessage
} = require(scriptModulePath);

test("deriveCreatorMessage prefers the first overview paragraph", () => {
  const message = deriveCreatorMessage({
    summary: "这是摘要",
    travelDetail: {
      overview: {
        whyJoinText: "这是第一段。\n\n这是第二段。"
      }
    }
  });

  assert.equal(message, "这是第一段。");
});

test("deriveCreatorMessage falls back to summary and then default text", () => {
  assert.equal(
    deriveCreatorMessage({
      summary: "这是摘要"
    }),
    "这是摘要"
  );

  assert.equal(
    deriveCreatorMessage({
      summary: "   ",
      travelDetail: {
        overview: {
          whyJoinText: "   "
        }
      }
    }),
    DEFAULT_CREATOR_MESSAGE
  );
});

test("buildServiceUpdatePlan only targets services with missing creatorMessage by default", () => {
  const plan = buildServiceUpdatePlan([
    {
      _id: "doc-1",
      slug: "ridge-journal",
      name: "高原谷地徒步手帐",
      creatorMessage: "",
      summary: "这是摘要"
    },
    {
      _id: "doc-2",
      slug: "wuyi-ink-trail",
      name: "武夷古道静心行",
      creatorMessage: "已有文案",
      summary: "另一个摘要"
    }
  ]);

  assert.deepEqual(
    plan.map((item) => ({
      _id: item._id,
      nextMessage: item.nextMessage,
      slug: item.slug
    })),
    [
      {
        _id: "doc-1",
        slug: "ridge-journal",
        nextMessage: "这是摘要"
      }
    ]
  );
});

test("buildServiceUpdatePlan can overwrite existing creatorMessage when requested", () => {
  const plan = buildServiceUpdatePlan(
    [
      {
        _id: "doc-2",
        slug: "wuyi-ink-trail",
        name: "武夷古道静心行",
        creatorMessage: "旧文案",
        summary: "这是摘要",
        travelDetail: {
          overview: {
            whyJoinText: "这是新的一段。\n\n这是另一段。"
          }
        }
      }
    ],
    { overwrite: true }
  );

  assert.equal(plan.length, 1);
  assert.equal(plan[0].previousMessage, "旧文案");
  assert.equal(plan[0].nextMessage, "这是新的一段。");
});
