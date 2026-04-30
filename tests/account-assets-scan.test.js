const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const pageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pkg/account/assets/index.js"
);

function loadAssetsPage(referralApi) {
  const originalLoad = Module._load;
  let pageConfig = null;

  global.Page = (config) => {
    pageConfig = config;
  };

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "../api/referral") {
      return referralApi;
    }

    if (request === "../../../services/user") {
      return {
        activateSession() {},
        getCurrentUser: async () => ({ id: "user_1" })
      };
    }

    if (request === "../../../services/navigation") {
      return {
        TOP_LEVEL_ROUTES: {
          home: "/pages/home/home",
          journeys: "/pages/destinations/index",
          profile: "/pages/profile/index"
        },
        goTopLevel() {}
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[pageModulePath];

  try {
    require(pageModulePath);
    assert.ok(pageConfig, "expected assets page config");
    return pageConfig;
  } finally {
    Module._load = originalLoad;
    delete global.Page;
  }
}

function createPageInstance(pageConfig) {
  return Object.assign({}, pageConfig, {
    data: Object.assign({}, pageConfig.data, {
      loggedIn: true
    }),
    setData(nextData) {
      this.data = Object.assign({}, this.data, nextData || {});
    },
    refresh: async () => {}
  });
}

async function scanWithResult(scanResult) {
  const bootstrapPayloads = [];
  const pageConfig = loadAssetsPage({
    bootstrapParticipation: async (payload) => {
      bootstrapPayloads.push(payload);
      return {
        message: "已确认备用码",
        currentUser: { id: "user_1" }
      };
    },
    getAssetOverview: async () => ({}),
    markCashRewardGiftOpened: async () => ({})
  });
  const page = createPageInstance(pageConfig);
  const navigationCalls = [];

  global.wx = {
    scanCode(options) {
      assert.deepEqual(options.scanType, ["qrCode", "wxCode"]);
      options.success(scanResult);
    },
    navigateTo(options) {
      navigationCalls.push(options);
    }
  };

  try {
    page.scanReferralQrCode();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    delete global.wx;
  }

  return {
    bootstrapPayloads,
    navigationCalls,
    page
  };
}

test("account assets scan button opens share referral page from scanned mini program path", async () => {
  const { bootstrapPayloads, navigationCalls, page } = await scanWithResult({
    path: "pkg/activity/share-referral/index?ref=friend01"
  });

  assert.deepEqual(navigationCalls, [
    {
      url: "/pkg/activity/share-referral/index?ref=FRIEND01"
    }
  ]);
  assert.deepEqual(bootstrapPayloads, []);
  assert.equal(page.data.referralCodeDraft, "FRIEND01");
  assert.equal(page.data.submittingReferralCode, false);
});

test("account assets scan button opens same share referral page from scanned scene payload", async () => {
  const { bootstrapPayloads, navigationCalls, page } = await scanWithResult({
    path: "pkg/activity/share-referral/index?scene=ref%3Dscene01"
  });

  assert.deepEqual(navigationCalls, [
    {
      url: "/pkg/activity/share-referral/index?ref=SCENE01"
    }
  ]);
  assert.deepEqual(bootstrapPayloads, []);
  assert.equal(page.data.referralCodeDraft, "SCENE01");
});

test("account assets scan button opens same share referral page from direct referral code", async () => {
  const { bootstrapPayloads, navigationCalls, page } = await scanWithResult({
    result: "plain01"
  });

  assert.deepEqual(navigationCalls, [
    {
      url: "/pkg/activity/share-referral/index?ref=PLAIN01"
    }
  ]);
  assert.deepEqual(bootstrapPayloads, []);
  assert.equal(page.data.referralCodeDraft, "PLAIN01");
});
