const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const pageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pkg/activity/share-referral/index.js"
);

function loadShareReferralPage(bootstrapResult) {
  const originalLoad = Module._load;
  let pageConfig = null;

  global.Page = (config) => {
    pageConfig = config;
  };

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "../api/referral") {
      return {
        bootstrapParticipation: async () => bootstrapResult
      };
    }

    if (request === "../../../services/user") {
      return {
        activateSession() {}
      };
    }

    if (request === "../../../services/navigation") {
      return {
        TOP_LEVEL_ROUTES: {
          journeys: "/pages/destinations/index"
        },
        goTopLevel() {}
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[pageModulePath];

  try {
    require(pageModulePath);
    assert.ok(pageConfig, "expected share referral page config");
    return pageConfig;
  } finally {
    Module._load = originalLoad;
    delete global.Page;
  }
}

function createPageInstance(pageConfig) {
  return Object.assign({}, pageConfig, {
    data: Object.assign({}, pageConfig.data),
    flowTimers: [],
    setData(nextData) {
      this.data = Object.assign({}, this.data, nextData || {});
    }
  });
}

test("share referral page shows gift modal for direct phase1 first award", async () => {
  const pageConfig = loadShareReferralPage({
    status: "awarded",
    resultScenario: "success_first_award",
    couponAwardSummary: {
      awardedAmount: 150,
      totalAmountAfter: 150,
      awardedTypes: ["share_referral_phase1_welcome_150"]
    },
    awardedCouponAssets: [
      {
        couponType: "share_referral_phase1_welcome_150",
        title: "野哉分享家新人券",
        amount: 150,
        threshold: 1000
      }
    ],
    campaign: {
      phase: "phase1",
      couponThreshold: 1000,
      copywriting: {
        firstAwardIntro: "恭喜获得150元优惠券，可以在价格超过1000元的路线上叠加使用！"
      }
    },
    currentUser: {
      id: "user_1",
      nickname: "海森"
    },
    ownReferralCode: "ABCD1234"
  });
  const page = createPageInstance(pageConfig);

  await page.bootstrap({});

  assert.equal(page.data.loading, false);
  assert.equal(page.data.flowStage, "gift_pending");
  assert.equal(page.data.stageView.showGiftModal, true);
  assert.equal(page.data.stageView.canOpenGift, true);
  assert.equal(page.data.resultView.awardIntroText, "恭喜获得150元优惠券，可以在价格超过1000元的路线上叠加使用！");
});

test("share referral page redirects existing coupon holders to assets on direct entry", async () => {
  const pageConfig = loadShareReferralPage({
    status: "idle",
    resultScenario: "idle",
    couponAwardSummary: {
      awardedAmount: 0,
      totalAmountAfter: 150,
      awardedTypes: []
    },
    awardedCouponAssets: [],
    campaign: {
      phase: "phase1",
      couponThreshold: 1000
    },
    currentUser: {
      id: "user_1",
      nickname: "海森"
    },
    ownReferralCode: "ABCD1234"
  });
  const page = createPageInstance(pageConfig);
  const redirectCalls = [];
  global.wx = {
    redirectTo(options) {
      redirectCalls.push(options);
    }
  };

  try {
    await page.bootstrap({});
  } finally {
    delete global.wx;
  }

  assert.deepEqual(redirectCalls, [
    {
      url: "/pkg/account/assets/index"
    }
  ]);
  assert.equal(page.data.flowStage, "checking");
});

test("share referral page does not show a gift modal for duplicate max scans", async () => {
  const pageConfig = loadShareReferralPage({
    status: "duplicate_max",
    message: "你已经拿到最高新人优惠券金额了～",
    resultScenario: "failed_ineligible",
    resultReason: "duplicate_max",
    couponAwardSummary: {
      awardedAmount: 0,
      totalAmountAfter: 150,
      awardedTypes: []
    },
    awardedCouponAssets: [],
    campaign: {
      phase: "phase1",
      couponThreshold: 1000
    },
    currentUser: {
      id: "user_1",
      nickname: "海森"
    },
    ownReferralCode: "ABCD1234"
  });
  const page = createPageInstance(pageConfig);

  await page.bootstrap({
    referralCode: "INVITE01"
  });

  assert.equal(page.data.flowStage, "failed");
  assert.equal(page.data.stageView.showGiftModal, false);
  assert.equal(page.data.resultView.reasonCards[0].title, "你已经拿到最高新人优惠券金额了～");
});

test("share referral page uses configured duplicate scan copy and hides relation timeline", async () => {
  const pageConfig = loadShareReferralPage({
    status: "duplicate_join",
    message: "你已参与过本次活动",
    resultScenario: "duplicate_bound",
    resultReason: "duplicate_join",
    couponAwardSummary: {
      awardedAmount: 0,
      totalAmountAfter: 150,
      awardedTypes: []
    },
    awardedCouponAssets: [],
    duplicateRecord: {
      firstValidScanAtText: "2026-04-28 17:01",
      couponStatusText: "¥150 已存入券包",
      timeline: [
        {
          key: "first_scan",
          title: "首次有效扫码",
          desc: "2026-04-28 17:01"
        },
        {
          key: "coupon_awarded",
          title: "券包入账",
          desc: "¥150 已存入券包"
        },
        {
          key: "relation_confirmed",
          title: "关系确认",
          desc: "已确认"
        }
      ]
    },
    campaign: {
      phase: "phase1",
      couponThreshold: 1000,
      copywriting: {
        duplicateJoinDesc: "后台配置的重复扫码说明"
      }
    },
    currentUser: {
      id: "user_1",
      nickname: "海森"
    },
    ownReferralCode: "ABCD1234"
  });
  const page = createPageInstance(pageConfig);

  await page.bootstrap({
    referralCode: "INVITE01"
  });
  page.clearFlowTimers();

  assert.equal(page.data.flowStage, "duplicate_record");
  assert.equal(page.data.resultView.resultDesc, "后台配置的重复扫码说明");
  assert.deepEqual(
    page.data.resultView.duplicateRecord.timeline.map((item) => item.title),
    ["首次有效扫码", "券包入账"]
  );
});

test("share referral page uses duplicate scan copy for duplicate max scans", async () => {
  const pageConfig = loadShareReferralPage({
    status: "duplicate_max",
    message: "你已经拿到最高新人优惠券金额了～",
    resultScenario: "duplicate_bound",
    resultReason: "duplicate_max",
    couponAwardSummary: {
      awardedAmount: 0,
      totalAmountAfter: 150,
      awardedTypes: []
    },
    awardedCouponAssets: [],
    campaign: {
      phase: "phase1",
      couponThreshold: 1000,
      copywriting: {
        duplicateJoinDesc: "后台配置的重复扫码说明"
      }
    },
    currentUser: {
      id: "user_1",
      nickname: "海森"
    },
    ownReferralCode: "ABCD1234"
  });
  const page = createPageInstance(pageConfig);

  await page.bootstrap({
    referralCode: "INVITE01"
  });
  page.clearFlowTimers();

  assert.equal(page.data.resultView.resultDesc, "后台配置的重复扫码说明");
});
