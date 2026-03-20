function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

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

  const travelDate = String(order && order.travelDate ? order.travelDate : "").trim();
  if (!travelDate) {
    return null;
  }

  return {
    dateStart: travelDate,
    dateEnd: travelDate
  };
}

function getTripPhaseKey(order) {
  const period = getOrderTravelPeriod(order);
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

function buildTripDateRange(order) {
  const period = getOrderTravelPeriod(order);
  const startDate = String(period && period.dateStart ? period.dateStart : order && order.travelDate ? order.travelDate : "").trim();
  const endDate = String(period && period.dateEnd ? period.dateEnd : startDate).trim();

  if (!startDate) {
    return "出行时间待确认";
  }

  if (!endDate || endDate === startDate) {
    return startDate;
  }

  return `${startDate} ～ ${endDate}`;
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
  buildTripDateRange,
  getStatusMeta,
  getOrderTabsMeta,
  getTripPhaseKey,
  buildOrderCard,
  filterOrdersByDisplayStatus
};
