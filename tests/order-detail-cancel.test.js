const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const orderDetailPageModulePath = path.resolve(
  __dirname,
  "../miniprogram/pkg/account/order-detail/index.js"
);

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadPageDefinition(cancelOrder) {
  const originalLoad = Module._load;
  const originalPage = global.Page;
  const originalWx = global.wx;
  let capturedDefinition = null;

  global.wx = {};
  global.Page = function registerPage(definition) {
    capturedDefinition = definition;
  };

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "../../../repositories/transaction-repository") {
      return {
        cancelOrder,
        getOrderById: async () => null
      };
    }

    if (request === "../../../repositories/payment-repository") {
      return {
        payOrderWithWechat: async () => ({})
      };
    }

    if (request === "../../../repositories/config-repository") {
      return {
        getOrderDetailPageConfig: async () => ({}),
        getServiceDetailPageConfig: async () => ({})
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[orderDetailPageModulePath];

  try {
    require(orderDetailPageModulePath);
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

test("order detail redirects to journeys after pending order cancellation succeeds", async () => {
  const canceledOrders = [];
  const toasts = [];
  const reLaunches = [];
  const modalPromises = [];
  const definition = loadPageDefinition(async (orderId) => {
    canceledOrders.push(orderId);
    return { id: orderId, status: "canceled" };
  });
  const page = createPageInstance(definition);
  page.setData({
    order: {
      id: "order-1",
      status: "pending"
    }
  });

  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  global.wx = {
    showModal(payload) {
      modalPromises.push(Promise.resolve(payload.success({ confirm: true })));
    },
    showToast(payload) {
      toasts.push(payload);
    },
    reLaunch(payload) {
      reLaunches.push(payload);
    }
  };
  global.setTimeout = (callback) => {
    callback();
    return 1;
  };

  try {
    page.cancelPendingOrder();
    await Promise.all(modalPromises);
  } finally {
    global.setTimeout = originalSetTimeout;
    if (originalWx === undefined) {
      delete global.wx;
    } else {
      global.wx = originalWx;
    }
  }

  assert.deepEqual(canceledOrders, ["order-1"]);
  assert.deepEqual(toasts, [{ title: "取消成功", icon: "success" }]);
  assert.deepEqual(reLaunches, [{ url: "/pages/destinations/index" }]);
});
