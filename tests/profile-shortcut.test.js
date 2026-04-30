const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const profilePageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pages/profile/index.js"
);

function loadProfilePage(options = {}) {
  const originalLoad = Module._load;
  let pageConfig = null;
  const entryStatus = options.entryStatus || {
    hasCoupon: false,
    shouldOpenAssets: false,
    couponTotalAmount: 0
  };

  global.Page = (config) => {
    pageConfig = config;
  };

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "../../services/user") {
      return {
        getMyPageData: async () => ({}),
        getMyPageInitialState: () => ({}),
        login: async () => ({}),
        updateProfile: async () => ({}),
        logout: async () => {}
      };
    }

    if (request === "../../api/cloud/referral") {
      return {
        getShareReferralEntryStatus: async () => entryStatus
      };
    }

    if (request === "../../utils/offline") {
      return {
        showOfflineOrderNotice() {}
      };
    }

    if (request === "../../utils/audit") {
      return {
        pickAuditText(value) {
          return value;
        }
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[profilePageModulePath];

  try {
    require(profilePageModulePath);
    assert.ok(pageConfig, "expected profile page config");
    return pageConfig;
  } finally {
    Module._load = originalLoad;
    delete global.Page;
  }
}

test("profile share referral shortcut opens the activity landing page when no coupon exists", async () => {
  const pageConfig = loadProfilePage();
  const navigateCalls = [];
  global.wx = {
    navigateTo(options) {
      navigateCalls.push(options);
    }
  };

  try {
    await pageConfig.onShortcutTap({
      currentTarget: {
        dataset: {
          key: "assets"
        }
      }
    });
  } finally {
    delete global.wx;
  }

  assert.deepEqual(navigateCalls, [
    {
      url: "/pkg/activity/share-referral/index"
    }
  ]);
});

test("profile share referral shortcut opens the asset page directly when coupons exist", async () => {
  const pageConfig = loadProfilePage({
    entryStatus: {
      hasCoupon: true,
      shouldOpenAssets: true,
      couponTotalAmount: 150
    }
  });
  const navigateCalls = [];
  const loadingCalls = [];
  global.wx = {
    showLoading(options) {
      loadingCalls.push(["show", options]);
    },
    hideLoading() {
      loadingCalls.push(["hide"]);
    },
    navigateTo(options) {
      navigateCalls.push(options);
    }
  };

  try {
    await pageConfig.onShortcutTap({
      currentTarget: {
        dataset: {
          key: "assets"
        }
      }
    });
  } finally {
    delete global.wx;
  }

  assert.deepEqual(navigateCalls, [
    {
      url: "/pkg/account/assets/index"
    }
  ]);
  assert.deepEqual(loadingCalls, [
    [
      "show",
      {
        title: "确认中",
        mask: true
      }
    ],
    ["hide"]
  ]);
});
