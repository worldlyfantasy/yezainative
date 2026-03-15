const { pickAuditText } = require("../utils/audit");
const { howItWorksFlows } = require("../mock/static-content");

function getHowItWorksPageConfig() {
  return {
    flows: (howItWorksFlows || []).map((item) => {
      if (item.title !== "托管支付") {
        return item;
      }

      return Object.assign({}, item, {
        title: pickAuditText("托管支付", "报名确认"),
        description: pickAuditText(item.description, "提交报名信息后，平台会与您确认名额、时间与后续安排。")
      });
    }),
    introText: pickAuditText(
      "野哉以托管支付与分账机制保障双方。当前 PHASE 1 只迁移页面与离线数据，不接支付、合同与云端履约。",
      "野哉会在报名确认、行前沟通与旅程履约之间提供清晰的信息同步与协作安排。"
    ),
    ctaTitle: pickAuditText("后续阶段再接入下单链路", "下一步如何确认报名"),
    ctaDesc: pickAuditText("当前小程序用于离线浏览与结构迁移验收。", "提交报名信息后，平台会统一跟进名额、时间与行前沟通安排，服务时间为工作日 10:00-18:00。"),
    ctaButtonText: pickAuditText("离线模式说明", "查看咨询说明")
  };
}

function getCheckoutPageConfig() {
  return {
    summaryTitleText: pickAuditText("订单摘要", "报名摘要"),
    refundAgreementTitle: pickAuditText("退订规则", "变更说明"),
    amountLabelText: pickAuditText("应付金额", "参考金额"),
    submitButtonText: pickAuditText("提交订单并支付", "提交报名信息"),
    agreements: {
      service: {
        title: "服务协议",
        content: pickAuditText(
          "一、服务内容与确认\n\n野哉（以下简称「平台」）为用户提供旅行相关服务信息展示、预约与订单管理。您在下单并支付后，即表示与平台及具体服务提供方达成服务约定，双方须按本协议及行程说明履行。\n\n二、费用与支付\n\n订单金额以页面展示及结算为准，支付成功后视为合同成立。如需发票，请在下单时备注或联系客服。因不可抗力或政策原因导致行程变更时，平台将按退订规则与您协商处理。\n\n三、双方义务\n\n平台负责协调行程安排、联络带领者与目的地资源；您需如实提供出行人信息、遵守行程须知与当地规定。因您提供信息不实或自身行为导致的损失，平台不承担责任。\n\n四、其他\n\n本协议未尽事宜以平台公示的补充说明为准。如有争议，双方应友好协商；协商不成的，可向平台运营主体所在地有管辖权的人民法院提起诉讼。",
          "一、服务内容与确认\n\n野哉（以下简称「平台」）为用户提供旅行相关服务信息展示、报名预约与订单管理。您在提交报名信息后，即表示愿意与平台及具体服务提供方进入行前确认流程，双方将按页面说明与后续沟通推进。\n\n二、费用与确认\n\n页面展示金额为当前行程参考价格，具体名额、出发时间与后续安排将在平台确认后进一步同步。如需开票或补充说明，可在报名后与平台沟通。\n\n三、双方义务\n\n平台负责协调行程安排、联络带领者与目的地资源；您需如实提供出行人信息、遵守行程须知与当地规定。因您提供信息不实或自身行为导致的损失，平台不承担责任。\n\n四、其他\n\n本协议未尽事宜以平台公示的补充说明为准。如有争议，双方应友好协商；协商不成的，可向平台运营主体所在地有管辖权的人民法院提起诉讼。"
        )
      },
      risk: {
        title: "风险告知书",
        content:
          "一、户外与旅行风险\n\n您所参与的行程可能涉及徒步、露营、高海拔、野外环境或长途交通等，存在一定人身与财产风险。请根据自身健康状况、体能及经验谨慎选择，并遵守带领者与当地的安全指引。\n\n二、健康与保险\n\n部分行程对年龄、体质或既往病史有要求，请如实告知并自行评估是否适宜参加。平台建议您自行购买与行程相匹配的意外及医疗等保险，以降低不可预见风险带来的损失。\n\n三、免责说明\n\n在您充分知晓并自愿承担上述风险的前提下报名，即视为接受行程固有风险。因不可抗力、第三方原因或您自身原因导致的人身伤害、财产损失或行程变更，平台将依服务协议与退订规则尽力协助，但除法律明确规定外不承担额外赔偿责任。"
      },
      refund: {
        title: pickAuditText("退订规则", "变更说明"),
        content: pickAuditText(
          "一、退订与改期\n\n订单支付成功后，如您因个人原因取消行程，将按以下时间节点收取相应违约金或费用：\n\n· 集合日前 30 天以上：可免费取消或改期一次（如有余位）。\n· 集合日前 16–30 天：扣除订单金额的 20% 作为违约金。\n· 集合日前 10–15 天：扣除订单金额的 50%。\n· 集合日前 5–9 天：扣除订单金额的 70%。\n· 集合日前 1–4 天及当天：不予退款，仅支持名额转让（若服务方同意）。\n\n二、不可抗力与行程变更\n\n因天气、政策、目的地临时关闭等不可抗力导致行程无法成行或重大变更的，平台将与您协商改期、替换线路或按未发生费用比例退款，不收取违约金。\n\n三、名额转让\n\n在符合服务方要求的前提下，您可将名额转让给他人，转让事宜需提前联系客服确认并配合完成信息变更。具体以当次行程说明为准。",
          "一、报名变更与取消\n\n报名信息提交后，如您因个人原因需要取消或调整，请尽快联系平台确认当次行程的可调整空间与处理方式。\n\n二、不可抗力与行程变更\n\n因天气、政策、目的地临时关闭等不可抗力导致行程无法成行或重大变更的，平台将与您协商改期、替换线路或其他合理处理方式。\n\n三、名额转让\n\n在符合服务方要求的前提下，您可将名额转让给他人，转让事宜需提前联系客服确认并配合完成信息变更。具体以当次行程说明为准。"
        )
      }
    }
  };
}

function getServiceDetailPageConfig() {
  return {
    consultWeChatQr: "https://picsum.photos/seed/yezai-wechat-qr/420/420",
    consultGroupQr: "https://picsum.photos/seed/yezai-group-qr/420/420",
    consultSheetTitle: "微信意向群",
    consultCardLabel: "",
    consultCardDesc: "扫码入群，咨询更多行程信息",
    consultFollowupNote: "报名确认后，将为您同步带领者信息与行前准备",
    timelineTitleText: pickAuditText("交付周期", "确认节奏"),
    refundTitleText: pickAuditText("退款规则", "变更说明"),
    serviceNoticeTitle: pickAuditText("离线提醒", "报名说明"),
    serviceNoticeBody: pickAuditText(
      "当前阶段仅保留服务说明，不接支付、合同与分账。",
      "当前页面展示行程信息与报名入口，提交后将由平台进一步确认。"
    )
  };
}

function getPaymentResultPageConfig() {
  return {
    titleText: pickAuditText("模拟支付成功", "报名提交成功"),
    subtitleText: pickAuditText(
      "当前仍是离线原型。这里模拟了支付成功状态，用于打通下单到订单详情的原型链路。",
      "我们已收到你的报名信息，接下来会继续确认名额、时间与出行安排。"
    ),
    detailButtonText: pickAuditText("查看订单详情", "查看报名详情"),
    listButtonText: pickAuditText("返回订单列表", "返回报名列表")
  };
}

function getOrderDetailPageConfig() {
  return {
    creatorContactText: pickAuditText("联系创作者：离线原型阶段暂不接入", "行前沟通：报名确认后同步创作者或带领者信息"),
    serviceContactText: pickAuditText("联系客服：离线原型阶段暂不接入", "咨询入口：平台统一跟进，服务时间为工作日 10:00-18:00"),
    statusTitleText: pickAuditText("订单状态", "报名状态"),
    orderIdLabelText: pickAuditText("订单号", "报名编号"),
    priceTitleText: pickAuditText("价格明细", "费用说明"),
    payableLabelText: pickAuditText("已付", "参考金额"),
    pendingPrimaryText: pickAuditText("立即支付", "确认报名"),
    pendingSecondaryText: pickAuditText("取消订单", "取消报名"),
    completedPrimaryText: pickAuditText("再次购买", "再次报名")
  };
}

function getFavoritesPageConfig() {
  return {
    loginHint: pickAuditText(
      "当前原型使用本地模拟登录，先到“我的”完成登录，再回来管理收藏。",
      "登录后可查看和管理你收藏的目的地、人物、行程与故事。"
    )
  };
}

module.exports = {
  getHowItWorksPageConfig,
  getCheckoutPageConfig,
  getServiceDetailPageConfig,
  getPaymentResultPageConfig,
  getOrderDetailPageConfig,
  getFavoritesPageConfig
};
