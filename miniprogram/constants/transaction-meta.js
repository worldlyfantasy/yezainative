const { isAuditMode } = require("../utils/audit");
const { services = [] } = require("../mock/services");

function getServiceBySlug(serviceSlug) {
  return services.find((item) => item.slug === serviceSlug) || null;
}

function findServicePeriod(order) {
  const service = getServiceBySlug(order && order.serviceSlug);
  if (!service || !Array.isArray(service.groupPeriods)) {
    return null;
  }

  return service.groupPeriods.find((period) => String(period.dateStart || "") === String(order && order.travelDate ? order.travelDate : ""));
}

function parseDateOnly(dateValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || "").trim());
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getTripPhaseKey(order) {
  const period = findServicePeriod(order);
  const startDate = parseDateOnly(period && period.dateStart ? period.dateStart : order && order.travelDate);
  const endDate = parseDateOnly(period && period.dateEnd ? period.dateEnd : period && period.dateStart ? period.dateStart : order && order.travelDate);

  if (!startDate || !endDate) {
    return "upcoming";
  }

  const today = new Date();
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (currentDate < startDate) {
    return "upcoming";
  }

  if (currentDate > endDate) {
    return "completed";
  }

  return "ongoing";
}

function getDisplayStatusKey(order) {
  if (!order) {
    return "";
  }

  if (order.status === "pending" || order.status === "canceled" || order.status === "completed") {
    return order.status;
  }

  if (order.status === "paid" || order.status === "traveling") {
    const tripPhaseKey = getTripPhaseKey(order);

    if (tripPhaseKey === "completed") {
      return "completed";
    }

    if (tripPhaseKey === "ongoing") {
      return "traveling";
    }

    return "paid";
  }

  return order.status;
}

function filterOrdersByDisplayStatus(orders, statusKey) {
  if (!statusKey || statusKey === "all") {
    return orders;
  }

  if (statusKey === "pending") {
    return orders.filter((order) => order.status === "pending");
  }

  if (statusKey === "not_departed") {
    return orders.filter((order) => {
      const displayStatusKey = getDisplayStatusKey(order);
      return displayStatusKey === "paid" || displayStatusKey === "traveling";
    });
  }

  if (statusKey === "completed") {
    return orders.filter((order) => getDisplayStatusKey(order) === "completed");
  }

  return orders.filter((order) => order.status === statusKey);
}

function getStatusMeta() {
  if (isAuditMode()) {
    return {
      all: { key: "all", label: "全部" },
      pending: { key: "pending", label: "待确认" },
      paid: { key: "paid", label: "已确认" },
      traveling: { key: "traveling", label: "进行中" },
      completed: { key: "completed", label: "已完成" },
      canceled: { key: "canceled", label: "已取消" }
    };
  }

  return {
    all: { key: "all", label: "全部" },
    pending: { key: "pending", label: "待确认" },
    paid: { key: "paid", label: "已确认" },
    traveling: { key: "traveling", label: "进行中" },
    completed: { key: "completed", label: "已完成" },
    canceled: { key: "canceled", label: "已取消" }
  };
}

function getOrderTabsMeta() {
  if (isAuditMode()) {
    return [
      { key: "all", label: "全部" },
      { key: "pending", label: "待确认" },
      { key: "not_departed", label: "已确认" },
      { key: "completed", label: "已完成" }
    ];
  }

  return [
    { key: "all", label: "全部" },
    { key: "pending", label: "待确认" },
    { key: "not_departed", label: "已确认" },
    { key: "completed", label: "已完成" }
  ];
}

function buildOrderCard(order) {
  const statusMeta = getStatusMeta();
  const displayStatusKey = getDisplayStatusKey(order);
  const displayStatus = statusMeta[displayStatusKey] || statusMeta[order.status];
  return Object.assign({}, order, {
    createdAt: order.createdAtText || order.createdAt,
    idPrefixText: "报名",
    statusText: displayStatus ? displayStatus.label : order.statusText,
    displayStatusKey,
    amountText: `¥${order.amount}`,
    payableText: `¥${order.payable}`,
    canContinuePay: false,
    primaryActionText: "查看详情"
  });
}

module.exports = {
  getStatusMeta,
  getOrderTabsMeta,
  buildOrderCard,
  filterOrdersByDisplayStatus
};
