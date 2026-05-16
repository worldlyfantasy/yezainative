const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const checkoutPageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pkg/explore/checkout/index.js"
);

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWxMock(storage = {}) {
  return {
    showToast() {},
    redirectTo() {},
    navigateTo() {},
    setStorageSync(key, value) {
      storage[key] = value;
    },
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
    },
    reportEvent() {}
  };
}

function loadPageDefinition(loader) {
  const originalLoad = Module._load;
  const originalPage = global.Page;
  const originalWx = global.wx;
  let capturedDefinition = null;

  global.wx = createWxMock();
  global.Page = function registerPage(definition) {
    capturedDefinition = definition;
  };

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "../../../api/cloud/referral") {
      return {
        getAssetOverview: async () => ({ coupons: [] })
      };
    }

    return loader(request, parent, isMain, originalLoad);
  };

  delete require.cache[checkoutPageModulePath];

  try {
    require(checkoutPageModulePath);
  } finally {
    Module._load = originalLoad;
    if (originalPage === undefined) {
      delete global.Page;
    } else {
      global.Page = originalPage;
    }

    if (originalWx === undefined) {
      delete global.wx;
    } else {
      global.wx = originalWx;
    }
  }

  return capturedDefinition;
}

function createPageInstance(definition) {
  const instance = {
    data: cloneData(definition.data),
    setData(update, callback) {
      Object.assign(this.data, update);
      if (typeof callback === "function") {
        callback();
      }
    }
  };

  Object.keys(definition).forEach((key) => {
    if (key === "data") {
      return;
    }

    if (typeof definition[key] === "function") {
      instance[key] = definition[key].bind(instance);
    }
  });

  return instance;
}

async function runPageOnLoad(page, options, wxMock) {
  const originalWx = global.wx;
  global.wx = wxMock || createWxMock();
  try {
    await page.onLoad(options);
  } finally {
    if (originalWx === undefined) {
      delete global.wx;
    } else {
      global.wx = originalWx;
    }
  }
}

function buildBookingPayload(overrides = {}) {
  const service = {
    slug: "day-route",
    name: "测试路线",
    type: "在地体验",
    durationTag: "1天",
    cover: "",
    creatorRoles: [],
    ...overrides.service
  };
  const groupPeriods = overrides.groupPeriods || [
    {
      periodCode: "P1",
      dateStart: "2026-04-14",
      dateEnd: "2026-04-14",
      durationDays: 1,
      price: 199,
      status: "available",
      remainingSeats: 5,
      singleRoomEnabled: true,
      singleRoomPrice: 300,
      singleRoomNotice: "默认单房说明"
    }
  ];

  return {
    service,
    creator: null,
    groupPeriods
  };
}

function buildPageConfig() {
  return {
    agreements: {
      service: { title: "服务协议", content: "服务协议内容" },
      risk: { title: "风险告知", content: "风险告知内容" },
      refund: { title: "退改规则", content: "退改规则内容" }
    },
    refundAgreementTitle: "退改规则",
    summaryTitleText: "确认订单",
    submitButtonText: "提交订单"
  };
}

test("checkout hides rooming section for one-day routes", async () => {
  const definition = loadPageDefinition((request, parent, isMain, originalLoad) => {
    if (request === "../../../repositories/content-repository") {
      return {
        getServiceBookingData: async () => buildBookingPayload()
      };
    }

    if (request === "../../../repositories/config-repository") {
      return {
        getCheckoutPageConfig: async () => buildPageConfig()
      };
    }

    if (request === "../../../api/cloud/user") {
      return {
        listTravelerProfiles: async () => []
      };
    }

    return originalLoad(request, parent, isMain);
  });

  const page = createPageInstance(definition);
  await runPageOnLoad(page, {
    slug: "day-route",
    periodCode: "P1",
    travelDateStart: "2026-04-14",
    travelDateEnd: "2026-04-14",
    peopleCount: "1"
  });

  assert.equal(page.data.showRoomingSection, false);
  assert.equal(page.data.roomingMode, "random");
  assert.equal(page.data.singleRoomEnabled, false);
});

test("checkout keeps rooming section for multi-day routes", async () => {
  const definition = loadPageDefinition((request, parent, isMain, originalLoad) => {
    if (request === "../../../repositories/content-repository") {
      return {
        getServiceBookingData: async () =>
          buildBookingPayload({
            service: {
              slug: "multi-route",
              durationTag: "2天"
            },
            groupPeriods: [
              {
                periodCode: "P2",
                dateStart: "2026-04-14",
                dateEnd: "2026-04-15",
                durationDays: 2,
                price: 699,
                status: "available",
                remainingSeats: 5,
                singleRoomEnabled: true,
                singleRoomPrice: 300,
                singleRoomNotice: "默认单房说明"
              }
            ]
          })
      };
    }

    if (request === "../../../repositories/config-repository") {
      return {
        getCheckoutPageConfig: async () => buildPageConfig()
      };
    }

    if (request === "../../../api/cloud/user") {
      return {
        listTravelerProfiles: async () => []
      };
    }

    return originalLoad(request, parent, isMain);
  });

  const page = createPageInstance(definition);
  await runPageOnLoad(page, {
    slug: "multi-route",
    periodCode: "P2",
    travelDateStart: "2026-04-14",
    travelDateEnd: "2026-04-15",
    peopleCount: "1"
  });

  assert.equal(page.data.showRoomingSection, true);
  assert.equal(page.data.singleRoomEnabled, true);
});

test("checkout adds single-room surcharge into payable summary", async () => {
  const definition = loadPageDefinition((request, parent, isMain, originalLoad) => {
    if (request === "../../../repositories/content-repository") {
      return {
        getServiceBookingData: async () =>
          buildBookingPayload({
            service: {
              slug: "single-room-route",
              durationTag: "3天"
            },
            groupPeriods: [
              {
                periodCode: "P3",
                dateStart: "2026-04-20",
                dateEnd: "2026-04-22",
                durationDays: 3,
                price: 999,
                status: "available",
                remainingSeats: 5,
                singleRoomEnabled: true,
                singleRoomPrice: 200,
                singleRoomNotice: "申请单房后，当前应付金额将包含该团期单房差。"
              }
            ]
          })
      };
    }

    if (request === "../../../repositories/config-repository") {
      return {
        getCheckoutPageConfig: async () => buildPageConfig()
      };
    }

    if (request === "../../../api/cloud/user") {
      return {
        listTravelerProfiles: async () => []
      };
    }

    return originalLoad(request, parent, isMain);
  });

  const page = createPageInstance(definition);
  await runPageOnLoad(page, {
    slug: "single-room-route",
    periodCode: "P3",
    travelDateStart: "2026-04-20",
    travelDateEnd: "2026-04-22",
    peopleCount: "1"
  });

  assert.equal(page.data.summaryPayable, "999");
  assert.equal(page.data.summarySingleRoomPrice, "0");

  page.onRoomingModeChange({
    detail: {
      value: "singleRoomRequest"
    },
    currentTarget: {
      dataset: {}
    }
  });

  assert.equal(page.data.roomingMode, "singleRoomRequest");
  assert.equal(page.data.summarySingleRoomPrice, "200");
  assert.equal(page.data.summaryPayable, "1199");
  assert.equal(page.data.payableText, "¥1199");
});

test("checkout draft restores traveler and contact but requires agreements again", async () => {
  const definition = loadPageDefinition((request, parent, isMain, originalLoad) => {
    if (request === "../../../repositories/content-repository") {
      return {
        getServiceBookingData: async () => buildBookingPayload()
      };
    }

    if (request === "../../../repositories/config-repository") {
      return {
        getCheckoutPageConfig: async () => buildPageConfig()
      };
    }

    if (request === "../../../api/cloud/user") {
      return {
        listTravelerProfiles: async () => []
      };
    }

    return originalLoad(request, parent, isMain);
  });

  const storage = {
    checkoutFormDraftV1: {
      key: "day-route|P1|2026-04-14|1|在地体验",
      travelPersons: [
        {
          index: 1,
          profileId: "profile_1",
          source: "traveler_profile",
          name: "张三",
          gender: "male",
          birthday: "1990-01-01",
          phone: "13800138000",
          documents: [
            {
              documentType: "idCard",
              documentNumber: "11010519491231002X"
            }
          ]
        }
      ],
      emergencyContactName: "李四",
      emergencyContactPhone: "13900139000",
      roomingMode: "random",
      roomType: "twin",
      allergyNotes: "无",
      selectedCouponId: "",
      agreedService: true,
      agreedRisk: true,
      agreedRefund: true
    }
  };

  const page = createPageInstance(definition);
  await runPageOnLoad(
    page,
    {
      slug: "day-route",
      periodCode: "P1",
      travelDateStart: "2026-04-14",
      travelDateEnd: "2026-04-14",
      peopleCount: "1"
    },
    createWxMock(storage)
  );

  assert.equal(page.data.travelPersons[0].name, "张三");
  assert.equal(page.data.emergencyContactName, "李四");
  assert.equal(page.data.emergencyContactPhone, "13900139000");
  assert.equal(page.data.agreedService, false);
  assert.equal(page.data.agreedRisk, false);
  assert.equal(page.data.agreedRefund, false);
});

test("checkout keeps the created order pending when WeChat payment is canceled", async () => {
  const canceledOrders = [];
  const toasts = [];
  const redirects = [];
  const definition = loadPageDefinition((request, parent, isMain, originalLoad) => {
    if (request === "../../../repositories/content-repository") {
      return {
        getServiceBookingData: async () => buildBookingPayload()
      };
    }

    if (request === "../../../repositories/config-repository") {
      return {
        getCheckoutPageConfig: async () => buildPageConfig()
      };
    }

    if (request === "../../../repositories/transaction-repository") {
      return {
        createOrder: async () => null,
        cancelOrder: async (orderId) => {
          canceledOrders.push(orderId);
          return { id: orderId, status: "canceled" };
        }
      };
    }

    if (request === "../../../repositories/payment-repository") {
      return {
        payOrderWithWechat: async () => {
          const error = new Error("requestPayment:fail cancel");
          error.errMsg = "requestPayment:fail cancel";
          error.paymentStage = "request";
          throw error;
        }
      };
    }

    if (request === "../../../api/cloud/user") {
      return {
        listTravelerProfiles: async () => []
      };
    }

    return originalLoad(request, parent, isMain);
  });

  const page = createPageInstance(definition);
  const originalWx = global.wx;
  global.wx = Object.assign(createWxMock(), {
    showToast: (payload) => toasts.push(payload),
    redirectTo: (payload) => redirects.push(payload)
  });

  try {
    await page.startOrderPayment({ id: "order-1" });
  } finally {
    if (originalWx === undefined) {
      delete global.wx;
    } else {
      global.wx = originalWx;
    }
  }

  assert.deepEqual(canceledOrders, []);
  assert.equal(toasts[0].title, "订单已保留，请在30分钟内完成支付");
  assert.deepEqual(redirects, [{ url: "/pkg/account/order-detail/index?id=order-1&pay=pending" }]);
});

test("checkout keeps the order when payment confirmation is still pending", async () => {
  const canceledOrders = [];
  const redirects = [];
  const definition = loadPageDefinition((request, parent, isMain, originalLoad) => {
    if (request === "../../../repositories/content-repository") {
      return {
        getServiceBookingData: async () => buildBookingPayload()
      };
    }

    if (request === "../../../repositories/config-repository") {
      return {
        getCheckoutPageConfig: async () => buildPageConfig()
      };
    }

    if (request === "../../../repositories/transaction-repository") {
      return {
        createOrder: async () => null,
        cancelOrder: async (orderId) => {
          canceledOrders.push(orderId);
          return { id: orderId, status: "canceled" };
        }
      };
    }

    if (request === "../../../repositories/payment-repository") {
      return {
        payOrderWithWechat: async () => {
          const error = new Error("query timeout");
          error.paymentStage = "confirm";
          throw error;
        }
      };
    }

    if (request === "../../../api/cloud/user") {
      return {
        listTravelerProfiles: async () => []
      };
    }

    return originalLoad(request, parent, isMain);
  });

  const page = createPageInstance(definition);
  const originalWx = global.wx;
  global.wx = Object.assign(createWxMock(), {
    redirectTo: (payload) => redirects.push(payload)
  });

  try {
    await page.startOrderPayment({ id: "order-2" });
  } finally {
    if (originalWx === undefined) {
      delete global.wx;
    } else {
      global.wx = originalWx;
    }
  }

  assert.deepEqual(canceledOrders, []);
  assert.deepEqual(redirects, [{ url: "/pkg/account/order-detail/index?id=order-2&pay=pending" }]);
});
