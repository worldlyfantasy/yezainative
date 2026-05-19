const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const transactionMeta = require("../miniprogram/constants/transaction-meta");
const { CUSTOM_TRIP_ENTRY_IMAGE } = require("../miniprogram/config/profile-page");
const userServiceModulePath = path.resolve(
  __dirname,
  "../miniprogram/services/user.js"
);
const ordersPageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pkg/account/orders/index.js"
);

async function withMockedDate(isoDateText, callback) {
  const RealDate = Date;
  const fixedTime = new RealDate(isoDateText).getTime();

  class MockDate extends RealDate {
    constructor(...args) {
      if (!args.length) {
        super(fixedTime);
        return;
      }

      super(...args);
    }

    static now() {
      return fixedTime;
    }
  }

  global.Date = MockDate;

  try {
    return await callback();
  } finally {
    global.Date = RealDate;
  }
}

function loadUserService(mocks) {
  const originalLoad = Module._load;

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "../repositories/user-repository") {
      return mocks.userRepository;
    }

    if (request === "../repositories/transaction-repository") {
      return mocks.transactionRepository;
    }

    if (request === "../repositories/config-repository") {
      return mocks.configRepository;
    }

    if (request === "./navigation") {
      return mocks.navigation;
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[userServiceModulePath];

  try {
    return require(userServiceModulePath);
  } finally {
    Module._load = originalLoad;
  }
}

function loadOrdersPageDefinition(mocks = {}) {
  const originalLoad = Module._load;
  const originalPage = global.Page;
  let capturedDefinition = null;

  global.Page = function registerPage(definition) {
    capturedDefinition = definition;
  };

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "../../../repositories/transaction-repository") {
      return mocks.transactionRepository || {
        getOrderStatusTabs: () => [],
        getOrders: async () => []
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[ordersPageModulePath];

  try {
    require(ordersPageModulePath);
  } finally {
    Module._load = originalLoad;
    if (originalPage === undefined) {
      delete global.Page;
    } else {
      global.Page = originalPage;
    }
  }

  return capturedDefinition;
}

test("transaction-meta builds display fields and filters confirmed orders by trip phase", () => {
  return withMockedDate("2026-03-26T09:00:00+08:00", () => {
    const upcomingOrder = transactionMeta.buildOrderCard({
      orderNo: "yz202603260123",
      status: "paid",
      amount: 1998,
      payable: 1898,
      travelPeriod: {
        dateStart: "2026-04-01",
        dateEnd: "2026-04-03"
      }
    });

    const completedOrder = {
      orderNo: "yz202603260456",
      status: "paid",
      amount: 998,
      payable: 998,
      travelPeriod: {
        dateStart: "2026-03-01",
        dateEnd: "2026-03-03"
      }
    };

    assert.equal(upcomingOrder.displayOrderNo, "0123");
    assert.equal(upcomingOrder.statusText, "已确认");
    assert.equal(upcomingOrder.displayStatusKey, "paid");
    assert.equal(upcomingOrder.travelDateText, "2026-04-01 ～ 2026-04-03");

    assert.deepEqual(
      transactionMeta.filterOrdersByDisplayStatus(
        [upcomingOrder, transactionMeta.buildOrderCard(completedOrder)],
        "not_departed"
      ).map((item) => item.orderNo),
      ["yz202603260123"]
    );
  });
});

test("transaction-meta normalizes order cover, price rows, and display service type", () => {
  const order = transactionMeta.buildOrderCard({
    orderNo: "yz202603260888",
    status: "pending",
    amount: 3280,
    discount: 0,
    payable: 3280,
    peopleCount: 1,
    serviceType: "带团旅行",
    cover: {
      card: "trip-cover-card.jpg",
      detail: "trip-cover-detail.jpg"
    },
    travelPeriod: {
      dateStart: "2026-04-15",
      dateEnd: "2026-04-18"
    }
  });

  assert.equal(order.cover, "trip-cover-card.jpg");
  assert.equal(order.serviceType, "长途旅行");
  assert.equal(order.showRoomingPreference, true);
  assert.equal(order.peopleCountText, "1人");
  assert.equal(order.unitPriceText, "¥3280");
  assert.equal(order.discountText, "¥0");
  assert.equal(order.totalPriceText, "¥3280");
});

test("transaction-meta sorts order cards by travel period descending", () => {
  const orders = [
    transactionMeta.buildOrderCard({
      orderNo: "yz202603260416",
      status: "canceled",
      travelPeriod: {
        dateStart: "2026-04-16",
        dateEnd: "2026-04-21"
      }
    }),
    transactionMeta.buildOrderCard({
      orderNo: "yz202603260702",
      status: "canceled",
      travelPeriod: {
        dateStart: "2026-07-02",
        dateEnd: "2026-07-07"
      }
    }),
    transactionMeta.buildOrderCard({
      orderNo: "yz202603260417",
      status: "canceled",
      travelPeriod: {
        dateStart: "2026-04-17",
        dateEnd: "2026-04-22"
      }
    })
  ];

  assert.deepEqual(
    transactionMeta.sortOrdersByTravelPeriodDesc(orders).map((item) => item.travelPeriod.dateStart),
    ["2026-07-02", "2026-04-17", "2026-04-16"]
  );
});

test("orders page defaults to all orders and still accepts explicit status", () => {
  const pageDefinition = loadOrdersPageDefinition();
  const page = {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(update) {
      Object.assign(this.data, update);
    }
  };

  assert.equal(page.data.currentStatus, "all");

  pageDefinition.onLoad.call(page, {
    status: "not_departed"
  });

  assert.equal(page.data.currentStatus, "not_departed");
});

test("transaction-meta hides rooming preference for one-day routes", () => {
  const order = transactionMeta.buildOrderCard({
    orderNo: "yz202603260889",
    status: "pending",
    amount: 680,
    payable: 680,
    peopleCount: 1,
    serviceType: "在地体验",
    travelPeriod: {
      dateStart: "2026-04-15",
      dateEnd: "2026-04-15"
    }
  });

  assert.equal(order.serviceType, "在地体验");
  assert.equal(order.showRoomingPreference, false);
});

test("user service keeps miniapp profile page free of trip display data", async () => {
  const service = loadUserService({
    userRepository: {
      getCurrentUser: async () => ({
        nickname: "阿野",
        profileConfigured: true
      }),
      getSessionSnapshot: () => ({
        loggedIn: true,
        user: {
          nickname: "阿野",
          profileConfigured: true
        }
      }),
      login: async () => {},
      updateProfile: async () => ({}),
      logout: async () => {}
    },
    navigation: {
      TOP_LEVEL_ROUTES: {
        profile: "/pages/profile/index"
      },
      goTopLevel() {}
    }
  });

  await withMockedDate("2026-03-26T09:00:00+08:00", async () => {
    const pageData = await service.getMyPageData();

    assert.equal(pageData.loggedIn, true);
    assert.equal(pageData.customTripEntryImage, CUSTOM_TRIP_ENTRY_IMAGE);
    assert.equal(Object.hasOwn(pageData, "recentOrders"), false);
    assert.equal(Object.hasOwn(pageData, "activeTrips"), false);
    assert.equal(Object.hasOwn(pageData, "emptyTripStateImage"), false);
  });
});
