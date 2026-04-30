const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const transactionMeta = require("../miniprogram/constants/transaction-meta");
const { EMPTY_TRIP_STATE_IMAGE } = require("../miniprogram/config/profile-page");
const userServiceModulePath = path.resolve(
  __dirname,
  "../miniprogram/services/user.js"
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

test("user service builds active trips for miniapp profile page", async () => {
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
    transactionRepository: {
      getRecentOrders: async (limit) => {
        const orders = [
          {
            orderNo: "order-upcoming",
            status: "paid",
            serviceSlug: "wuyi-ink-trail",
            serviceName: "武夷墨迹",
            serviceType: "长途旅行",
            cover: "service-cover.jpg",
            serviceSnapshot: {
              serviceName: "武夷墨迹",
              cover: "snapshot-cover.jpg",
              serviceType: "长途旅行",
              creatorRoles: ["创作者", "带领者"]
            },
            creatorSnapshot: {
              name: "山野向导",
              slug: "guide-a",
              avatar: "guide-a.jpg",
              stance: "以山路看世界"
            },
            travelPeriod: {
              dateStart: "2026-04-02",
              dateEnd: "2026-04-04"
            }
          },
          {
            orderNo: "order-ongoing",
            status: "traveling",
            serviceSlug: "songhua-dock",
            serviceName: "松花泊行",
            serviceType: "短途旅行",
            serviceSnapshot: {
              serviceName: "松花泊行",
              cover: "ongoing-cover.jpg",
              serviceType: "短途旅行"
            },
            creatorSnapshot: {
              name: "策划师",
              slug: "planner-b"
            },
            travelPeriod: {
              dateStart: "2026-03-25",
              dateEnd: "2026-03-27"
            }
          },
          {
            orderNo: "order-completed",
            status: "paid",
            serviceSlug: "done",
            travelPeriod: {
              dateStart: "2026-03-01",
              dateEnd: "2026-03-03"
            }
          }
        ];

        return orders.slice(0, limit);
      }
    },
    configRepository: {
      getProfilePageConfig: async () => {
        throw new Error("profile page image should come from front-end config");
      }
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
    assert.equal(pageData.recentOrders.length, 2);
    assert.deepEqual(
      pageData.activeTrips.map((item) => item.orderNo),
      ["order-upcoming", "order-ongoing"]
    );
    assert.equal(pageData.activeTrips[0].tripPhaseLabel, "待出发");
    assert.equal(pageData.activeTrips[0].creatorRoleText, "创作者 · 带领者");
    assert.equal(pageData.activeTrips[0].serviceCover, "snapshot-cover.jpg");
    assert.equal(pageData.activeTrips[1].tripPhaseLabel, "在进行");
    assert.equal(pageData.activeTrips[1].creatorRoleText, "创作者 · 带领者");
    assert.equal(pageData.emptyTripStateImage, EMPTY_TRIP_STATE_IMAGE);
  });
});
