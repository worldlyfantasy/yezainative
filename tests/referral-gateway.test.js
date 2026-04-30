const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const gatewayModulePath = path.resolve(
  __dirname,
  "../cloudfunctions/referralGateway/index.js"
);

function loadReferralGatewayModule() {
  const originalLoad = Module._load;
  const collectionData = arguments[0] && arguments[0].collectionData ? arguments[0].collectionData : {};
  const collectionUpdates = [];
  const collectionAdds = [];
  const uploadCalls = [];
  const wxacodeCalls = [];

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "wx-server-sdk") {
      return {
        DYNAMIC_CURRENT_ENV: "test-env",
        init() {},
        database() {
          function matchesWhere(doc, query) {
            if (!query || typeof query !== "object") {
              return true;
            }

            return Object.entries(query).every(([key, expected]) => {
              const actual = doc && doc[key];
              if (expected && typeof expected === "object" && Object.prototype.hasOwnProperty.call(expected, "$neq")) {
                return actual !== expected.$neq;
              }
              return actual === expected;
            });
          }

          return {
            command: {
              neq(value) {
                return { $neq: value };
              }
            },
            collection(name) {
              const readRows = () => {
                const rows = collectionData[name];
                return Array.isArray(rows) ? rows : [];
              };
              let query = null;
              let limit = null;
              let skip = 0;

              return {
                where() {
                  query = arguments[0] || null;
                  return this;
                },
                skip() {
                  const parsed = Number(arguments[0]);
                  skip = Number.isFinite(parsed) ? parsed : 0;
                  return this;
                },
                limit() {
                  const parsed = Number(arguments[0]);
                  limit = Number.isFinite(parsed) ? parsed : null;
                  return this;
                },
                doc(id) {
                  return {
                    update: async ({ data } = {}) => {
                      const rows = readRows();
                      const rowIndex = rows.findIndex((item) => item && item._id === id);
                      if (rowIndex >= 0) {
                        rows[rowIndex] = Object.assign({}, rows[rowIndex], data || {});
                        collectionUpdates.push({ name, id, data: data || {} });
                      }
                      return {};
                    }
                  };
                },
                get: async () => {
                  const rows = readRows().filter((item) => matchesWhere(item, query));
                  const skippedRows = skip ? rows.slice(skip) : rows;
                  return {
                    data: limit ? skippedRows.slice(0, limit) : skippedRows
                  };
                },
                add: async ({ data } = {}) => {
                  const rows = readRows();
                  const id = data && data._id ? data._id : `${name}_${rows.length + 1}`;
                  const nextDoc = Object.assign({ _id: id }, data || {});
                  rows.push(nextDoc);
                  collectionAdds.push({ name, data: nextDoc });
                  return { _id: id };
                }
              };
            }
          };
        },
        openapi: {
          wxacode: {
            getUnlimited: async (payload) => {
              wxacodeCalls.push(payload || {});
              return {
                buffer: Buffer.from("mock-wxacode")
              };
            }
          }
        },
        uploadFile: async ({ cloudPath, fileContent } = {}) => {
          uploadCalls.push({
            cloudPath,
            fileContent
          });
          return {
            fileID: `cloud://test-env/${cloudPath}`
          };
        },
        getWXContext() {
          return { OPENID: "test-openid" };
        }
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[gatewayModulePath];

  try {
    const moduleExports = require(gatewayModulePath);
    return Object.assign({}, moduleExports, {
      __mocks__: {
        collectionAdds,
        collectionUpdates,
        uploadCalls,
        wxacodeCalls
      }
    });
  } finally {
    Module._load = originalLoad;
  }
}

test("referralGateway builds coupon and reward asset overview for the current user", () => {
  const { __test__ } = loadReferralGatewayModule();

  const overview = __test__.buildAssetOverview(
    {
      campaignName: "野哉分享家",
      campaignKey: "yezai_share_referral"
    },
    "ABCD1234",
    [
      {
        _id: "coupon_1",
        title: "野哉分享家新人券",
        amount: 100,
        threshold: 1000,
        status: "active",
        expiresAt: Date.UTC(2026, 5, 1, 0, 0, 0),
        grantedAt: Date.UTC(2026, 3, 10, 0, 0, 0)
      },
      {
        _id: "coupon_2",
        title: "野哉分享家加码券",
        amount: 50,
        threshold: 1000,
        status: "used",
        expiresAt: Date.UTC(2026, 5, 1, 0, 0, 0),
        grantedAt: Date.UTC(2026, 3, 11, 0, 0, 0)
      }
    ],
    [
      {
        _id: "reward_1",
        rewardAmount: 100,
        status: "awaiting_account",
        sourceOrderNo: "yz202604150001",
        serviceName: "春山慢行",
        earnedAt: Date.UTC(2026, 3, 15, 8, 0, 0)
      },
      {
        _id: "reward_2",
        rewardAmount: 100,
        status: "paid",
        sourceOrderNo: "yz202604150002",
        serviceName: "夏野入谷",
        earnedAt: Date.UTC(2026, 2, 20, 8, 0, 0)
      }
    ],
    Date.UTC(2026, 3, 15, 12, 0, 0)
  );

  assert.equal(overview.ownReferralCode, "ABCD1234");
  assert.equal(overview.couponSummary.activeCount, 1);
  assert.equal(overview.couponSummary.usedCount, 1);
  assert.equal(overview.couponSummary.totalAmount, 150);
  assert.equal(overview.couponSummary.summaryText, "1 张可用券");
  assert.equal(overview.rewardSummary.totalAmount, 200);
  assert.equal(overview.rewardSummary.pendingCount, 1);
  assert.equal(overview.rewardSummary.summaryText, "累计 200 元 · 1 笔待处理");
  assert.equal(overview.rewardGift.shouldOpen, true);
  assert.equal(overview.rewardGift.totalAmount, 100);
  assert.deepEqual(overview.rewardGift.rewardIds, ["reward_1"]);
  assert.equal(overview.coupons.find((item) => item.status === "active").statusLabel, "待使用");
  assert.equal(overview.rewards[0].statusLabel, "待补收款信息");
});

test("referralGateway marks cash reward gifts as opened by inviter", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      cash_reward_ledgers: [
        {
          _id: "reward_1",
          inviterUserId: "user_1",
          rewardAmount: 100,
          status: "awaiting_account",
          earnedAt: Date.UTC(2026, 3, 15, 8, 0, 0)
        },
        {
          _id: "reward_other",
          inviterUserId: "user_other",
          rewardAmount: 100,
          status: "awaiting_account",
          earnedAt: Date.UTC(2026, 3, 15, 8, 0, 0)
        }
      ]
    }
  });

  const result = await main({
    action: "markCashRewardGiftOpened",
    payload: {
      rewardIds: ["reward_1", "reward_other"]
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.updatedIds, ["reward_1"]);
  assert.equal(__mocks__.collectionUpdates.some((item) => item.name === "cash_reward_ledgers" && item.id === "reward_1" && item.data.giftOpenedAt), true);
  assert.equal(__mocks__.collectionUpdates.some((item) => item.name === "cash_reward_ledgers" && item.id === "reward_other"), false);
});

test("referralGateway saves payout account and moves pending rewards into payable", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家"
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_1",
          userId: "user_1",
          userOpenid: "test-openid",
          referralCode: "ABCD1234",
          status: "active"
        }
      ],
      cash_reward_ledgers: [
        {
          _id: "ledger_1",
          inviterUserId: "user_1",
          campaignKey: "yezai_share_referral",
          rewardAmount: 100,
          status: "awaiting_account",
          earnedAt: 1776240000000
        },
        {
          _id: "ledger_2",
          inviterUserId: "user_1",
          campaignKey: "yezai_share_referral",
          rewardAmount: 100,
          status: "payable",
          earnedAt: 1776240000000
        }
      ],
      payout_accounts: []
    }
  });

  const result = await main({
    action: "savePayoutAccount",
    payload: {
      accountName: "林海森",
      phone: "13800138000",
      bankName: "招商银行杭州分行",
      bankAccountNo: "6225888888881234",
      idNumberLast4: "1234"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "payable");
  assert.equal(result.data.statusLabel, "可打款");
  assert.equal(result.data.bankAccountMasked, "************1234");
  assert.equal(result.data.phoneMasked, "138****8000");
  assert.equal(__mocks__.collectionUpdates.some((item) => item.name === "cash_reward_ledgers" && item.id === "ledger_1" && item.data.status === "payable"), true);
  assert.equal(__mocks__.collectionUpdates.some((item) => item.name === "cash_reward_ledgers" && item.id === "ledger_2"), false);
});

test("referralGateway asset overview includes payout account summary", () => {
  const { __test__ } = loadReferralGatewayModule();

  const overview = __test__.buildAssetOverview(
    {
      campaignName: "野哉分享家",
      campaignKey: "yezai_share_referral"
    },
    "ABCD1234",
    [],
    [
      {
        _id: "reward_1",
        rewardAmount: 100,
        status: "payable",
        earnedAt: Date.UTC(2026, 3, 15, 8, 0, 0)
      }
    ],
    {
      accountId: "payout_1",
      status: "under_review",
      accountName: "林海森",
      bankName: "招商银行杭州分行",
      bankAccountNo: "6225888888881234",
      phone: "13800138000"
    },
    Date.UTC(2026, 3, 15, 12, 0, 0)
  );

  assert.equal(overview.rewardSummary.payoutAccountStatus, "payable");
  assert.equal(overview.rewardSummary.payoutAccountStatusLabel, "可打款");
  assert.equal(overview.rewardSummary.payoutAccount.bankAccountMasked, "************1234");
  assert.equal(overview.rewardSummary.payoutAccount.phoneMasked, "138****8000");
});

test("referralGateway generates and caches a personal mini program qr code for asset overview", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1"
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_1",
          userId: "user_1",
          userOpenid: "test-openid",
          referralCode: "ABCD1234",
          status: "active"
        }
      ],
      user_coupon_assets: [],
      cash_reward_ledgers: [],
      payout_accounts: []
    }
  });

  const result = await main({
    action: "getAssetOverview",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.ownReferralCode, "ABCD1234");
  assert.equal(result.data.shareScene, "ref=ABCD1234");
  assert.equal(result.data.sharePath, "/pkg/activity/share-referral/index?ref=ABCD1234");
  assert.match(result.data.shareQrCodeFileID, /^cloud:\/\/test-env\/share-referral\/qrcodes\/user_1-ABCD1234\.jpg$/);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "user_coupon_assets").length, 0);
  assert.equal(__mocks__.wxacodeCalls.length, 1);
  assert.deepEqual(__mocks__.wxacodeCalls[0], {
    scene: "ref=ABCD1234",
    page: "pkg/activity/share-referral/index",
    checkPath: false,
    envVersion: "trial"
  });
  assert.equal(__mocks__.uploadCalls.length, 1);
  assert.equal(__mocks__.collectionUpdates.length, 1);
  assert.equal(__mocks__.collectionUpdates[0].data.qrCodeScene, "ref=ABCD1234");
});

test("referralGateway entry status does not award coupons or create share assets", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1"
          }
        }
      ],
      referral_codes: [],
      user_coupon_assets: [],
      cash_reward_ledgers: [],
      payout_accounts: []
    }
  });

  const result = await main({
    action: "getShareReferralEntryStatus",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.hasCoupon, false);
  assert.equal(result.data.shouldOpenAssets, false);
  assert.equal(result.data.couponTotalAmount, 0);
  assert.equal(result.data.eligibleForDirectAward, true);
  assert.equal(__mocks__.collectionAdds.length, 0);
  assert.equal(__mocks__.wxacodeCalls.length, 0);
  assert.equal(__mocks__.uploadCalls.length, 0);
});

test("referralGateway entry status reports existing share referral coupons", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase2"
          }
        }
      ],
      user_coupon_assets: [
        {
          _id: "coupon_1",
          userId: "user_1",
          userOpenid: "test-openid",
          campaignKey: "yezai_share_referral",
          couponType: "share_referral_welcome_100",
          title: "野哉分享家新人券",
          amount: 100,
          threshold: 1000,
          status: "active",
          grantedAt: Date.UTC(2026, 3, 1, 0, 0, 0),
          expiresAt: Date.UTC(2027, 3, 1, 0, 0, 0)
        }
      ]
    }
  });

  const result = await main({
    action: "getShareReferralEntryStatus",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.hasCoupon, true);
  assert.equal(result.data.shouldOpenAssets, true);
  assert.equal(result.data.couponCount, 1);
  assert.equal(result.data.couponTotalAmount, 100);
  assert.equal(__mocks__.collectionAdds.length, 0);
});

test("referralGateway grants phase1 direct benefits to existing users during testing rollout", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 2,
          lastTravelAt: Date.UTC(2025, 10, 1, 0, 0, 0)
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1",
            testingRollout: {
              allowExistingUsersAsNew: true
            }
          }
        }
      ],
      referral_codes: [],
      user_coupon_assets: []
    }
  });

  const result = await main({
    action: "ensureDirectRegistrationBenefits",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "awarded");
  assert.equal(result.data.resultScenario, "success_first_award");
  assert.equal(result.data.couponAwardSummary.awardedAmount, 150);
  assert.equal(result.data.couponAwardSummary.totalAmountAfter, 150);
  assert.equal(result.data.awardedCouponAssets.length, 1);
  assert.equal(result.data.awardedCouponAssets[0].amount, 150);
  assert.equal(result.data.campaign.phase, "phase1");
  assert.equal(
    result.data.campaign.copywriting.firstAwardIntro,
    "恭喜获得150元优惠券，可以在价格超过1000元的路线上叠加使用！"
  );
  assert.equal(result.data.ownReferralCode.length, 8);
  assert.equal(result.data.shareScene, `ref=${result.data.ownReferralCode}`);
  assert.equal(result.data.sharePath, `/pkg/activity/share-referral/index?ref=${result.data.ownReferralCode}`);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "user_coupon_assets").length, 1);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "referral_codes").length, 1);
});

test("referralGateway awards phase1 direct gift when entering without referral code", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1"
          }
        }
      ],
      referral_codes: [],
      user_coupon_assets: []
    }
  });

  const result = await main({
    action: "bootstrapParticipation",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "awarded");
  assert.equal(result.data.resultScenario, "success_first_award");
  assert.equal(result.data.couponAwardSummary.awardedAmount, 150);
  assert.equal(result.data.awardedCouponAssets.length, 1);
  assert.equal(result.data.awardedCouponAssets[0].amount, 150);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "user_coupon_assets").length, 1);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "referral_relations").length, 0);
});

test("referralGateway awards phase2 direct gift when entering without referral code", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase2"
          }
        }
      ],
      referral_codes: [],
      user_coupon_assets: []
    }
  });

  const result = await main({
    action: "bootstrapParticipation",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "awarded");
  assert.equal(result.data.resultScenario, "success_first_award");
  assert.equal(result.data.couponAwardSummary.awardedAmount, 100);
  assert.equal(result.data.awardedCouponAssets.length, 1);
  assert.equal(result.data.awardedCouponAssets[0].amount, 100);
  assert.equal(
    result.data.campaign.copywriting.phase2DirectAwardIntro,
    "恭喜获得100元优惠券，可以在价格超过1000元的路线上使用！"
  );
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "user_coupon_assets").length, 1);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "referral_relations").length, 0);
});

test("referralGateway direct benefits remain idempotent after the welcome coupon exists", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1",
            testingRollout: {
              allowExistingUsersAsNew: true
            }
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_1",
          userId: "user_1",
          userOpenid: "test-openid",
          referralCode: "ABCD1234",
          status: "active"
        }
      ],
      user_coupon_assets: [
        {
          _id: "coupon_1",
          userId: "user_1",
          userOpenid: "test-openid",
          campaignKey: "yezai_share_referral",
          couponType: "share_referral_phase1_welcome_150",
          title: "野哉分享家新人券",
          amount: 150,
          threshold: 1000,
          stackGroup: "share_referral_phase1",
          status: "active",
          grantedAt: Date.UTC(2026, 3, 1, 0, 0, 0),
          expiresAt: Date.UTC(2027, 3, 1, 0, 0, 0),
          updatedAt: Date.UTC(2026, 3, 1, 0, 0, 0)
        }
      ]
    }
  });

  const result = await main({
    action: "ensureDirectRegistrationBenefits",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "ready");
  assert.equal(result.data.resultScenario, "idle");
  assert.equal(result.data.awardedCouponAssets.length, 0);
  assert.equal(result.data.ownReferralCode, "ABCD1234");
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "user_coupon_assets").length, 0);
});

test("referralGateway does not let testing rollout treat old users as new in phase2", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 1,
          lastTravelAt: Date.UTC(2026, 0, 1, 0, 0, 0)
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase2",
            testingRollout: {
              allowExistingUsersAsNew: true
            }
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_inviter",
          userId: "user_inviter",
          userOpenid: "inviter-openid",
          referralCode: "INVITE01",
          status: "active"
        }
      ],
      user_coupon_assets: []
    }
  });

  const result = await main({
    action: "bootstrapParticipation",
    payload: {
      referralCode: "INVITE01"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "invalid_old_user");
  assert.equal(result.data.resultScenario, "failed_ineligible");
  assert.equal(result.data.resultReason, "old_user");
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "user_coupon_assets").length, 0);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "referral_relations").length, 0);
});

test("referralGateway identifies self scans as an ineligible scan scenario", async () => {
  const { main } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1",
            testingRollout: {
              allowExistingUsersAsNew: true
            }
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_1",
          userId: "user_1",
          userOpenid: "test-openid",
          referralCode: "ABCD1234",
          status: "active"
        }
      ],
      user_coupon_assets: [
        {
          _id: "coupon_1",
          userId: "user_1",
          campaignKey: "yezai_share_referral",
          couponType: "share_referral_phase1_welcome_150",
          amount: 150,
          status: "active"
        }
      ]
    }
  });

  const result = await main({
    action: "bootstrapParticipation",
    payload: {
      referralCode: "ABCD1234"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "invalid_self");
  assert.equal(result.data.resultScenario, "failed_ineligible");
  assert.equal(result.data.resultReason, "self_scan");
  assert.equal(result.data.couponAwardSummary.totalAmountAfter, 150);
});

test("referralGateway identifies invalid referral codes as an ineligible scan scenario", async () => {
  const { main } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1"
          }
        }
      ],
      referral_codes: [],
      user_coupon_assets: []
    }
  });

  const result = await main({
    action: "bootstrapParticipation",
    payload: {
      referralCode: "MISSING1"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "invalid_code");
  assert.equal(result.data.resultScenario, "failed_ineligible");
  assert.equal(result.data.resultReason, "invalid_code");
});

test("referralGateway identifies duplicate scans as a bound referral scenario", async () => {
  const { main } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        },
        {
          _id: "user_3",
          openid: "first-inviter-openid",
          nickname: "某某",
          memberLabel: "分享家 A",
          effectiveOrderCount: 2,
          lastTravelAt: Date.UTC(2026, 3, 20, 2, 0, 0)
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1"
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_own",
          userId: "user_1",
          userOpenid: "test-openid",
          referralCode: "OWN12345",
          status: "active"
        },
        {
          _id: "code_inviter",
          userId: "user_2",
          userOpenid: "inviter-openid",
          referralCode: "INVITE01",
          status: "active"
        }
      ],
      referral_relations: [
        {
          _id: "relation_1",
          inviterUserId: "user_3",
          inviteeUserId: "user_1",
          firstValidScanAt: Date.UTC(2026, 3, 26, 2, 18, 0),
          firstValidScanCode: "FIRST001",
          status: "active"
        }
      ],
      user_coupon_assets: [
        {
          _id: "coupon_1",
          userId: "user_1",
          campaignKey: "yezai_share_referral",
          couponType: "share_referral_phase1_welcome_150",
          amount: 150,
          status: "active"
        }
      ]
    }
  });

  const result = await main({
    action: "bootstrapParticipation",
    payload: {
      referralCode: "INVITE01"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "duplicate_max");
  assert.equal(result.data.resultScenario, "duplicate_bound");
  assert.equal(result.data.resultReason, "duplicate_max");
  assert.equal(result.data.relationId, "relation_1");
  assert.equal(result.data.duplicateRecord.firstValidScanAtText, "2026-04-26 10:18");
  assert.equal(result.data.duplicateRecord.firstInviterName, "分享家 A（某某）");
  assert.equal(result.data.duplicateRecord.couponStatusText, "¥150 已存入券包");
  assert.equal(result.data.duplicateRecord.relationStatusText, "已确认");
  assert.deepEqual(
    result.data.duplicateRecord.timeline.map((item) => item.title),
    ["首次有效扫码", "券包入账"]
  );
});

test("referralGateway does not recreate legacy same-code relations without status", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        },
        {
          _id: "user_2",
          openid: "inviter-openid",
          nickname: "林越",
          effectiveOrderCount: 2,
          lastTravelAt: Date.UTC(2026, 3, 20, 2, 0, 0)
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1"
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_own",
          userId: "user_1",
          userOpenid: "test-openid",
          referralCode: "OWN12345",
          status: "active"
        },
        {
          _id: "code_inviter",
          userId: "user_2",
          userOpenid: "inviter-openid",
          referralCode: "INVITE01",
          status: "active"
        }
      ],
      referral_relations: [
        {
          _id: "relation_legacy",
          inviterUserId: "user_2",
          inviteeUserId: "user_1",
          firstValidScanAt: Date.UTC(2026, 3, 26, 2, 18, 0),
          firstValidScanCode: "INVITE01"
        }
      ],
      user_coupon_assets: [
        {
          _id: "coupon_1",
          userId: "user_1",
          campaignKey: "yezai_share_referral",
          couponType: "share_referral_phase1_welcome_150",
          amount: 150,
          status: "active"
        }
      ]
    }
  });

  const result = await main({
    action: "bootstrapParticipation",
    payload: {
      referralCode: "INVITE01"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "duplicate_max");
  assert.equal(result.data.resultScenario, "duplicate_bound");
  assert.equal(result.data.relationId, "relation_legacy");
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "referral_relations").length, 0);
});

test("referralGateway blocks phase1 scans after the invitee already has the max coupon", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        },
        {
          _id: "user_2",
          openid: "inviter-openid",
          nickname: "林越",
          effectiveOrderCount: 2,
          lastTravelAt: Date.UTC(2026, 3, 20, 2, 0, 0)
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1"
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_own",
          userId: "user_1",
          userOpenid: "test-openid",
          referralCode: "OWN12345",
          status: "active"
        },
        {
          _id: "code_inviter",
          userId: "user_2",
          userOpenid: "inviter-openid",
          referralCode: "INVITE01",
          status: "active"
        }
      ],
      referral_relations: [],
      user_coupon_assets: [
        {
          _id: "coupon_1",
          userId: "user_1",
          campaignKey: "yezai_share_referral",
          couponType: "share_referral_phase1_welcome_150",
          amount: 150,
          status: "active"
        }
      ]
    }
  });

  const result = await main({
    action: "bootstrapParticipation",
    payload: {
      referralCode: "INVITE01"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "duplicate_max");
  assert.equal(result.data.message, "你已经拿到最高新人优惠券金额了～");
  assert.equal(result.data.resultScenario, "failed_ineligible");
  assert.equal(result.data.resultReason, "duplicate_max");
  assert.equal(result.data.couponAwardSummary.awardedAmount, 0);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "referral_relations").length, 0);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "user_coupon_assets").length, 0);
  assert.equal(
    __mocks__.collectionAdds.some((item) => item.name === "referral_scan_events" && item.data.resultCode === "duplicate_max"),
    true
  );
});

test("referralGateway marks phase2 scan-only bonus as a bonus upgrade scenario", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "test-openid",
          nickname: "海森",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase2"
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_own",
          userId: "user_1",
          userOpenid: "test-openid",
          referralCode: "OWN12345",
          status: "active"
        },
        {
          _id: "code_inviter",
          userId: "user_2",
          userOpenid: "inviter-openid",
          referralCode: "INVITE01",
          status: "active"
        }
      ],
      user_coupon_assets: [
        {
          _id: "coupon_1",
          userId: "user_1",
          campaignKey: "yezai_share_referral",
          couponType: "share_referral_welcome_100",
          amount: 100,
          status: "active"
        }
      ],
      referral_relations: []
    }
  });

  const result = await main({
    action: "bootstrapParticipation",
    payload: {
      referralCode: "INVITE01"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, "awarded");
  assert.equal(result.data.resultScenario, "phase2_bonus");
  assert.equal(result.data.couponAwardSummary.awardedAmount, 50);
  assert.equal(result.data.couponAwardSummary.totalAmountAfter, 150);
  assert.equal(result.data.awardedCouponAssets.length, 1);
  assert.equal(result.data.awardedCouponAssets[0].amount, 50);
  assert.equal(
    result.data.campaign.copywriting.bonusUpgradeIntro,
    "恭喜获得额外50元的优惠券，可以在价格超过1000元的路线上使用！"
  );
  assert.equal(__mocks__.collectionAdds.some((item) => item.name === "referral_relations"), true);
});

test("referralGateway backfills phase1 benefits for existing users idempotently", async () => {
  const { main, __mocks__ } = loadReferralGatewayModule({
    collectionData: {
      users: [
        {
          _id: "user_1",
          openid: "openid-1",
          nickname: "用户1",
          effectiveOrderCount: 3,
          lastTravelAt: Date.UTC(2025, 0, 1, 0, 0, 0)
        },
        {
          _id: "user_2",
          openid: "openid-2",
          nickname: "用户2",
          effectiveOrderCount: 0,
          lastTravelAt: 0
        }
      ],
      app_configs: [
        {
          _id: "config_1",
          key: "shareReferralCampaign",
          value: {
            campaignKey: "yezai_share_referral",
            campaignName: "野哉分享家",
            phase: "phase1",
            testingRollout: {
              allowExistingUsersAsNew: true
            }
          }
        }
      ],
      referral_codes: [
        {
          _id: "code_2",
          userId: "user_2",
          userOpenid: "openid-2",
          referralCode: "USER2222",
          status: "active"
        }
      ],
      user_coupon_assets: [
        {
          _id: "coupon_2",
          userId: "user_2",
          userOpenid: "openid-2",
          campaignKey: "yezai_share_referral",
          couponType: "share_referral_phase1_welcome_150",
          amount: 150,
          status: "active"
        }
      ]
    }
  });

  const result = await main({
    action: "backfillPhase1Benefits",
    payload: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.scanned, 2);
  assert.equal(result.data.awarded, 1);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "user_coupon_assets").length, 1);
  assert.equal(__mocks__.collectionAdds.filter((item) => item.name === "referral_codes").length, 1);
});
