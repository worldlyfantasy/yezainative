const { isAuditMode } = require("../utils/audit");

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
    pending: { key: "pending", label: "待支付" },
    paid: { key: "paid", label: "已付款" },
    traveling: { key: "traveling", label: "进行中" },
    completed: { key: "completed", label: "已完成" },
    canceled: { key: "canceled", label: "已退订" }
  };
}

function getOrderTabsMeta() {
  if (isAuditMode()) {
    return [
      { key: "all", label: "全部" },
      { key: "pending", label: "待确认" },
      { key: "not_departed", label: "未出行" },
      { key: "canceled", label: "已取消" },
      { key: "to_review", label: "待反馈" }
    ];
  }

  return [
    { key: "all", label: "全部" },
    { key: "pending", label: "待支付" },
    { key: "not_departed", label: "未出行" },
    { key: "canceled", label: "已退订" },
    { key: "to_review", label: "待反馈" }
  ];
}

function buildOrderCard(order) {
  const statusMeta = getStatusMeta();
  return Object.assign({}, order, {
    createdAt: order.createdAtText || order.createdAt,
    idPrefixText: isAuditMode() ? "报名" : "订单",
    statusText: statusMeta[order.status] ? statusMeta[order.status].label : order.statusText,
    amountText: `¥${order.amount}`,
    payableText: `¥${order.payable}`,
    canContinuePay: order.status === "pending",
    primaryActionText: isAuditMode() ? "确认报名" : "继续支付"
  });
}

module.exports = {
  getStatusMeta,
  getOrderTabsMeta,
  buildOrderCard
};
