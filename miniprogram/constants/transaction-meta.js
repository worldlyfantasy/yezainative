const { normalizeImageRef } = require("../services/image-ref");

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

const DISPLAY_SERVICE_TYPES = ["在地体验", "短途旅行", "长途旅行", "国际旅行"];

function parseDateOnly(dateValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || "").trim());
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getOrderTravelPeriod(order) {
  if (isPlainObject(order && order.travelPeriod)) {
    return order.travelPeriod;
  }

  const dateStart = String(order && order.travelDateStart ? order.travelDateStart : "").trim();
  const dateEnd = String(
    order && (order.travelDateEnd || order.travelDateStart)
      ? (order.travelDateEnd || order.travelDateStart)
      : ""
  ).trim();

  if (!dateStart) {
    return null;
  }

  return {
    dateStart,
    dateEnd: dateEnd || dateStart
  };
}

function getTripPhaseKey(order) {
  const period = getOrderTravelPeriod(order);
  const startDate = parseDateOnly(period && period.dateStart ? period.dateStart : "");
  const endDate = parseDateOnly(period && period.dateEnd ? period.dateEnd : period && period.dateStart ? period.dateStart : "");

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

function buildTripDateRange(order) {
  const period = getOrderTravelPeriod(order);
  const startDate = String(period && period.dateStart ? period.dateStart : "").trim();
  const endDate = String(period && period.dateEnd ? period.dateEnd : startDate).trim();

  if (!startDate) {
    return "出行时间待确认";
  }

  if (!endDate || endDate === startDate) {
    return startDate;
  }

  return `${startDate} ～ ${endDate}`;
}

function inferDisplayServiceType(order) {
  const period = getOrderTravelPeriod(order);
  const startDate = parseDateOnly(period && period.dateStart ? period.dateStart : "");
  const endDate = parseDateOnly(period && period.dateEnd ? period.dateEnd : period && period.dateStart ? period.dateStart : "");

  if (!startDate || !endDate) {
    return "短途旅行";
  }

  const oneDayMs = 24 * 60 * 60 * 1000;
  const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / oneDayMs) + 1);

  if (durationDays >= 4) {
    return "长途旅行";
  }

  if (durationDays >= 2) {
    return "短途旅行";
  }

  return "在地体验";
}

function normalizeOrderServiceType(order) {
  const serviceType = String(
    (order && order.serviceSnapshot && order.serviceSnapshot.serviceType)
      || (order && order.serviceType)
      || ""
  ).trim();

  if (DISPLAY_SERVICE_TYPES.includes(serviceType)) {
    return serviceType;
  }

  return inferDisplayServiceType(order);
}

function getOrderDurationDays(order) {
  const period = getOrderTravelPeriod(order);
  const startDate = parseDateOnly(period && period.dateStart ? period.dateStart : "");
  const endDate = parseDateOnly(period && period.dateEnd ? period.dateEnd : period && period.dateStart ? period.dateStart : "");

  if (!startDate || !endDate) {
    return 0;
  }

  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / oneDayMs) + 1);
}

function shouldShowOrderRoomingPreference(order, serviceType) {
  const durationDays = getOrderDurationDays(order);
  if (durationDays > 0) {
    return durationDays > 1;
  }

  return serviceType === "长途旅行" || serviceType === "国际旅行";
}

function formatCurrency(amount) {
  const numericAmount = Number(amount);
  const normalizedAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  return `¥${normalizedAmount}`;
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
  return [
    { key: "all", label: "全部" },
    { key: "pending", label: "待确认" },
    { key: "not_departed", label: "已确认" },
    { key: "completed", label: "已完成" }
  ];
}

function buildOrderDisplayNo(order) {
  const orderNo = String(order && order.orderNo ? order.orderNo : "").trim();
  if (!orderNo) {
    return "--";
  }

  return orderNo.slice(-4);
}

function buildOrderCard(order) {
  const statusMeta = getStatusMeta();
  const displayStatusKey = getDisplayStatusKey(order);
  const displayStatus = statusMeta[displayStatusKey] || statusMeta[order.status];
  const peopleCount = Number.isFinite(Number(order && order.peopleCount)) && Number(order.peopleCount) > 0
    ? Number(order.peopleCount)
    : 1;
  const amount = Number.isFinite(Number(order && order.amount)) ? Number(order.amount) : 0;
  const discount = Number.isFinite(Number(order && order.discount)) ? Number(order.discount) : 0;
  const payable = Number.isFinite(Number(order && order.payable)) ? Number(order.payable) : amount - discount;
  const serviceSnapshot = isPlainObject(order && order.serviceSnapshot) ? order.serviceSnapshot : {};
  const normalizedCover = normalizeImageRef(serviceSnapshot.cover || order.cover, "card");
  const normalizedServiceType = normalizeOrderServiceType(order);

  return Object.assign({}, order, {
    createdAt: order.createdAt,
    displayOrderNo: buildOrderDisplayNo(order),
    idPrefixText: "报名",
    statusText: displayStatus ? displayStatus.label : order.statusText,
    displayStatusKey,
    cover: normalizedCover,
    serviceType: normalizedServiceType,
    showRoomingPreference: shouldShowOrderRoomingPreference(order, normalizedServiceType),
    amountText: formatCurrency(amount),
    unitPriceText: formatCurrency(Math.round(amount / peopleCount)),
    peopleCountText: `${peopleCount}人`,
    discountText: formatCurrency(discount),
    payableText: formatCurrency(payable),
    totalPriceText: formatCurrency(payable),
    travelDateText: buildTripDateRange(order),
    canContinuePay: false,
    primaryActionText: "查看详情"
  });
}

module.exports = {
  buildTripDateRange,
  getStatusMeta,
  getOrderTabsMeta,
  getTripPhaseKey,
  buildOrderCard,
  filterOrdersByDisplayStatus
};
