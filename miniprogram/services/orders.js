const { services, destinations } = require("../mock/index");

const ORDERS_KEY = "yezai_orders";

const STATUS_META = {
  all: { key: "all", label: "全部" },
  pending: { key: "pending", label: "待支付" },
  paid: { key: "paid", label: "已付款" },
  traveling: { key: "traveling", label: "进行中" },
  completed: { key: "completed", label: "已完成" },
  canceled: { key: "canceled", label: "已退订" }
};

/** 订单列表页使用的 5 个 Tab：全部、待支付、未出行、已退订、待反馈 */
const ORDER_TABS = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待支付" },
  { key: "not_departed", label: "未出行" },
  { key: "canceled", label: "已退订" },
  { key: "to_review", label: "待反馈" }
];

function createDefaultOrders() {
  const sampleService = services[0];
  return [
    {
      id: "yz20260301001",
      shortId: "1001",
      serviceSlug: sampleService.slug,
      serviceName: sampleService.name,
      cover: getOrderCover(sampleService),
      travelDate: "2026-03-20",
      peopleCount: 2,
      serviceType: sampleService.type,
      amount: 8560,
      discount: 0,
      payable: 8560,
      status: "paid",
      statusText: STATUS_META.paid.label,
      traveler: {
        name: "林旅人",
        idCard: "440101199012120000",
        phone: "13800000000"
      },
      note: "希望有两位成年人同行，接受慢节奏。",
      createdAt: "2026-03-01 09:00"
    }
  ];
}

function getOrderCover(service) {
  const destination = destinations.find((item) => service.destinationSlugs.includes(item.slug));
  return destination ? destination.cover : "https://picsum.photos/seed/yezai-order-fallback/1200/800";
}

function ensureOrders() {
  let orders = wx.getStorageSync(ORDERS_KEY);
  if (!orders || !orders.length) {
    orders = createDefaultOrders();
    wx.setStorageSync(ORDERS_KEY, orders);
  }
  return orders;
}

function saveOrders(orders) {
  wx.setStorageSync(ORDERS_KEY, orders);
}

function buildOrderCard(order) {
  return Object.assign({}, order, {
    amountText: `¥${order.amount}`,
    payableText: `¥${order.payable}`,
    canContinuePay: order.status === "pending"
  });
}

function getOrderStatusTabs() {
  return ORDER_TABS;
}

function getOrders(statusKey) {
  const orders = ensureOrders();
  let list = orders;
  if (statusKey && statusKey !== "all") {
    if (statusKey === "pending") {
      list = orders.filter((o) => o.status === "pending");
    } else if (statusKey === "not_departed") {
      list = orders.filter((o) => o.status === "paid" || o.status === "traveling");
    } else if (statusKey === "canceled") {
      list = orders.filter((o) => o.status === "canceled");
    } else if (statusKey === "to_review") {
      list = orders.filter((o) => o.status === "completed");
    }
  }
  return list.map(buildOrderCard);
}

function getRecentOrders(limit) {
  return getOrders("all").slice(0, limit || 2);
}

function getOrderById(orderId) {
  const orders = ensureOrders();
  const order = orders.find((item) => item.id === orderId);
  return order ? buildOrderCard(order) : null;
}

function createOrder(payload) {
  const service = services.find((item) => item.slug === payload.serviceSlug);
  const orders = ensureOrders();
  const timestamp = Date.now();
  const id = `yz${timestamp}`;
  const order = {
    id,
    shortId: String(id).slice(-4),
    serviceSlug: service.slug,
    serviceName: service.name,
    cover: getOrderCover(service),
    travelDate: payload.travelDate,
    peopleCount: payload.peopleCount,
    serviceType: service.type,
    amount: payload.amount,
    discount: 0,
    payable: payload.amount,
    status: "pending",
    statusText: STATUS_META.pending.label,
    traveler: payload.traveler,
    travelers: payload.travelers || (payload.traveler ? [payload.traveler] : []),
    note: payload.note || "",
    createdAt: new Date(timestamp).toLocaleString("zh-CN", { hour12: false })
  };

  orders.unshift(order);
  saveOrders(orders);
  return buildOrderCard(order);
}

function updateOrderStatus(orderId, status) {
  const orders = ensureOrders();
  const target = orders.find((item) => item.id === orderId);
  if (!target || !STATUS_META[status]) {
    return null;
  }

  target.status = status;
  target.statusText = STATUS_META[status].label;
  saveOrders(orders);
  return buildOrderCard(target);
}

function cancelOrder(orderId) {
  return updateOrderStatus(orderId, "canceled");
}

function payOrder(orderId) {
  return updateOrderStatus(orderId, "paid");
}

module.exports = {
  getOrderStatusTabs,
  getOrders,
  getRecentOrders,
  getOrderById,
  createOrder,
  cancelOrder,
  payOrder
};
