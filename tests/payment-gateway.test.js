const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const gatewayModulePath = path.resolve(
  __dirname,
  "../cloudfunctions/paymentGateway/index.js"
);

function loadPaymentGatewayModule() {
  const originalLoad = Module._load;
  const originalEnv = {
    LIANLIAN_BASE_URL: process.env.LIANLIAN_BASE_URL,
    LIANLIAN_ACCP_API_BASE_URL: process.env.LIANLIAN_ACCP_API_BASE_URL,
    LIANLIAN_MCH_ID: process.env.LIANLIAN_MCH_ID,
    LIANLIAN_PRIVATE_KEY_PKCS8: process.env.LIANLIAN_PRIVATE_KEY_PKCS8,
    LIANLIAN_PUBLIC_KEY: process.env.LIANLIAN_PUBLIC_KEY,
    LIANLIAN_PAYMENT_NOTIFY_URL: process.env.LIANLIAN_PAYMENT_NOTIFY_URL,
    LIANLIAN_PLATFORM_ACCOUNT_ACCT_TYPE: process.env.LIANLIAN_PLATFORM_ACCOUNT_ACCT_TYPE,
    LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNTS: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNTS,
    LIANLIAN_PLATFORM_WITHDRAWAL_PAYER_ACCT_TYPE: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_PAYER_ACCT_TYPE,
    TCB_ENV: process.env.TCB_ENV,
    WECHAT_APP_ID: process.env.WECHAT_APP_ID,
    WECHAT_APPID: process.env.WECHAT_APPID
  };

  process.env.LIANLIAN_BASE_URL = "https://test.lianlianpay.example";
  process.env.LIANLIAN_ACCP_API_BASE_URL = "https://accpapi-test.lianlianpay.example";
  process.env.LIANLIAN_MCH_ID = "402603230000090659";
  process.env.LIANLIAN_PRIVATE_KEY_PKCS8 = "dummy-private-key";
  process.env.LIANLIAN_PUBLIC_KEY = "dummy-public-key";
  process.env.LIANLIAN_PAYMENT_NOTIFY_URL = "https://service.example.com/lianlian/payment/notify";
  process.env.TCB_ENV = "test-env";
  process.env.WECHAT_APP_ID = "wxc257583a047566a3";
  process.env.WECHAT_APPID = "wxc257583a047566a3";

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "wx-server-sdk") {
      return {
        DYNAMIC_CURRENT_ENV: "test-env",
        init() {},
        database() {
          return {
            collection() {
              return {
                add: async () => ({ _id: "record_1" }),
                doc() {
                  return {
                    update: async () => ({})
                  };
                },
                where() {
                  return this;
                },
                orderBy() {
                  return this;
                },
                limit() {
                  return this;
                },
                get: async () => ({ data: [] })
              };
            }
          };
        },
        getWXContext() {
          return { OPENID: "openid-test" };
        }
      };
    }

    if (request === "@cloudbase/node-sdk") {
      return {
        init() {
          return {
            auth() {
              return {};
            },
            models: {}
          };
        }
      };
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[gatewayModulePath];

  try {
    return require(gatewayModulePath);
  } finally {
    Module._load = originalLoad;
    Object.keys(originalEnv).forEach((key) => {
      if (originalEnv[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  }
}

function withPaymentEnv(fn) {
  const originalEnv = {
    LIANLIAN_BASE_URL: process.env.LIANLIAN_BASE_URL,
    LIANLIAN_ACCP_API_BASE_URL: process.env.LIANLIAN_ACCP_API_BASE_URL,
    LIANLIAN_MCH_ID: process.env.LIANLIAN_MCH_ID,
    LIANLIAN_PRIVATE_KEY_PKCS8: process.env.LIANLIAN_PRIVATE_KEY_PKCS8,
    LIANLIAN_PUBLIC_KEY: process.env.LIANLIAN_PUBLIC_KEY,
    LIANLIAN_PAYMENT_NOTIFY_URL: process.env.LIANLIAN_PAYMENT_NOTIFY_URL,
    LIANLIAN_PLATFORM_ACCOUNT_ACCT_TYPE: process.env.LIANLIAN_PLATFORM_ACCOUNT_ACCT_TYPE,
    LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNTS: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNTS,
    LIANLIAN_PLATFORM_WITHDRAWAL_PAYER_ACCT_TYPE: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_PAYER_ACCT_TYPE,
    WECHAT_APPID: process.env.WECHAT_APPID
  };

  process.env.LIANLIAN_BASE_URL = "https://test.lianlianpay.example";
  process.env.LIANLIAN_ACCP_API_BASE_URL = "https://accpapi-test.lianlianpay.example";
  process.env.LIANLIAN_MCH_ID = "402603230000090659";
  process.env.LIANLIAN_PRIVATE_KEY_PKCS8 = "dummy-private-key";
  process.env.LIANLIAN_PUBLIC_KEY = "dummy-public-key";
  process.env.LIANLIAN_PAYMENT_NOTIFY_URL = "https://service.example.com/lianlian/payment/notify";
  process.env.WECHAT_APPID = "wxc257583a047566a3";

  try {
    return fn();
  } finally {
    Object.keys(originalEnv).forEach((key) => {
      if (originalEnv[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  }
}

test("paymentGateway builds WeChat mini program createpay body for secondary merchant user payee", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildCreatePaymentBody({
      amount: 3980,
      orderInfo: "野哉-雪山巡礼",
      orderNo: "yz-test-order-001",
      openid: "openid-abc",
      txnSeqno: "YZPAY202605090001"
    }));

  assert.equal(body.mch_id, "402603230000090659");
  assert.equal(body.sub_mchid, "402605060000097988");
  assert.equal(body.order_amount, "3980.00");
  assert.equal(body.risk_item, "");
  assert.equal(body.pay_expire, 30);
  assert.equal(body.share_flag, "DELAY");
  assert.deepEqual(body.goods_info, [
    {
      goods_id: "yz-test-order-001",
      goods_name: "野哉-雪山巡礼",
      goods_category: "旅行服务",
      goods_quantity: "1",
      goods_price: "3980.00",
      goods_body: "野哉-雪山巡礼"
    }
  ]);
  assert.deepEqual(body.pay_method_infos, [
    {
      pay_type: "WECHAT_APPLET",
      amount: "3980.00"
    }
  ]);
  assert.deepEqual(body.payee_infos, [
    {
      payee_uid: "YEZAI_ENTERPRISE_MAIN",
      payee_accttype: "FUNDPROCESS",
      payee_type: "USER",
      payee_amount: "3980.00",
      payee_memo: "野哉二级商户收款"
    }
  ]);
  assert.deepEqual(JSON.parse(body.extend_info), {
    wx_data: {
      appid: "wxc257583a047566a3",
      openid: "openid-abc"
    }
  });
});

test("paymentGateway uses platform merchant payment endpoints", () => {
  const { __test__ } = loadPaymentGatewayModule();

  assert.equal(__test__.LIANLIAN_CREATEPAY_PATH, "/mch/v1/ipay/createpay");
  assert.equal(__test__.LIANLIAN_ORDERQUERY_PATH, "/mch/v1/ipay/orderquery");
  assert.equal(__test__.LIANLIAN_REFUND_PATH, "/mch/v1/ipay/refund");
  assert.equal(__test__.LIANLIAN_REFUND_QUERY_PATH, "/mch/v1/ipay/refundquery");
  assert.equal(__test__.LIANLIAN_WITHDRAWAL_QUERY_PATH, "/query/mch/v1/accp/txn/withdrawal-query");
  assert.equal(__test__.LIANLIAN_ACCP_ACCOUNT_INFO_PATH, "/v1/acctmgr/query-acctinfo");
  assert.equal(__test__.LIANLIAN_ACCP_ACCOUNT_SERIAL_PATH, "/v1/acctmgr/query-acctserial");
});

test("paymentGateway builds platform withdrawal from legal merchant own account", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => {
    process.env.LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNTS = JSON.stringify([
      {
        id: "yezai-postal-default",
        linkedAcctno: "933011013000776233",
        isDefault: true
      }
    ]);
    return __test__.buildPlatformWithdrawalBody({
      accountId: "yezai-postal-default",
      notifyUrl: "https://service.example.com/lianlian/withdrawal/notify",
      orderAmount: "0.01",
      txnSeqno: "YZWD202605110001",
      txnTime: "20260511120000"
    });
  });

  assert.equal(body.payer_info.payer_accttype, "MCHOWN");
  assert.equal(body.payee_info.linked_acctno, "933011013000776233");
  assert.equal(body.order_amount, "0.01");
});

test("paymentGateway builds platform account info body for ACCP", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildPlatformAccountInfoBody({
    timestamp: "20260511120000"
  }));

  assert.deepEqual(body, {
    timestamp: "20260511120000",
    oid_partner: "402603230000090659",
    user_type: "INNERMERCHANT"
  });
});

test("paymentGateway builds platform account serial query body", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildPlatformAccountSerialBody({
    dateStart: "2026-05-01",
    dateEnd: "20260511",
    flagDc: "c",
    pageNo: 2,
    pageSize: 100,
    timestamp: "20260511120000"
  }));

  assert.deepEqual(body, {
    timestamp: "20260511120000",
    oid_partner: "402603230000090659",
    user_type: "INNERMERCHANT",
    acct_type: "MCHOWN_AVAILABLE",
    date_start: "20260501000000",
    date_end: "20260511235959",
    page_no: "2",
    page_size: "50",
    flag_dc: "C"
  });
});

test("paymentGateway normalizes ACCP account and serial responses without leaking account numbers", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const accountInfo = __test__.normalizePlatformAccountInfoResponse({
    ret_code: "0000",
    user_id: "402603230000090659",
    user_type: "INNERMERCHANT",
    bank_account: "933011013000776233",
    acctinfo_list: [
      {
        oid_acctno: "933011013000776233",
        acct_type: "MCHOWN_AVAILABLE",
        acct_state: "NORMAL",
        amt_balcur: "123.45",
        amt_balaval: "120.00",
        amt_balfrz: "3.45"
      }
    ]
  });
  const serials = __test__.normalizePlatformAccountSerialResponse({
    ret_code: "0000",
    acctbal_list: [
      {
        oid_acctno: "933011013000776233",
        jno_acct: "JNO1",
        txn_type: "ACCT_CASH_OUT",
        flag_dc: "D",
        amt: "10.00",
        amt_bal: "110.00"
      }
    ]
  });

  assert.equal(accountInfo.userIdMasked, "4026***0659");
  assert.equal(accountInfo.accounts[0].accountNoMasked, "9330***6233");
  assert.equal(accountInfo.accounts[0].bankAccountMasked, "**************6233");
  assert.equal(accountInfo.accounts[0].accountStatus, "NORMAL");
  assert.equal(accountInfo.accounts[0].availableAmount, "120.00");
  assert.equal(serials.records[0].accountNoMasked, "9330***6233");
  assert.equal(serials.records[0].amount, "10.00");
});

test("paymentGateway builds refund body from original payment snapshots", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const paymentRecord = {
    txnSeqno: "YZPAY202605090001",
    requestSnapshot: {
      sub_mchid: "402605060000097988",
      pay_method_infos: [
        {
          pay_type: "WECHAT_APPLET",
          amount: "100.00"
        }
      ],
      payee_infos: [
        {
          payee_uid: "YEZAI_ENTERPRISE_MAIN",
          payee_accttype: "FUNDPROCESS",
          payee_type: "USER",
          payee_amount: "100.00",
          payee_memo: "野哉二级商户收款"
        }
      ]
    }
  };
  const body = withPaymentEnv(() => __test__.buildRefundBody({
    notifyUrl: "https://service.example.com/lianlian/refund/notify",
    refundAmount: "12.34",
    refundReason: "用户取消报名",
    refundSeqno: "YZREF202605090001"
  }, {
    paymentRecord,
    txnSeqno: "YZPAY202605090001"
  }));

  assert.equal(body.mch_id, "402603230000090659");
  assert.equal(body.sub_mchid, "402605060000097988");
  assert.equal(body.refund_seqno, "YZREF202605090001");
  assert.equal(body.txn_seqno, "YZPAY202605090001");
  assert.equal(body.refund_amount, "12.34");
  assert.equal(body.refund_reason, "用户取消报名");
  assert.equal(body.notify_url, "https://service.example.com/lianlian/refund/notify");
  assert.deepEqual(body.refund_method_infos, [
    {
      pay_type: "WECHAT_APPLET",
      amount: "12.34"
    }
  ]);
  assert.deepEqual(body.payee_refund_infos, [
    {
      payee_uid: "YEZAI_ENTERPRISE_MAIN",
      payee_accttype: "FUNDPROCESS",
      payee_type: "USER",
      payee_amount: "12.34",
      payee_memo: "野哉二级商户收款"
    }
  ]);
});

test("paymentGateway builds refund query body by refund sequence", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildRefundQueryBody(
    { refundDate: "20260509" },
    {
      refundSeqno: "YZREF202605090001",
      requestSnapshot: {
        sub_mchid: "402605060000097988"
      }
    }
  ));

  assert.deepEqual(body, {
    mch_id: "402603230000090659",
    sub_mchid: "402605060000097988",
    refund_seqno: "YZREF202605090001",
    refund_date: "20260509"
  });
});

test("paymentGateway builds AT WeChat sub-merchant config body", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildAtSubMerchantWechatConfigBody({
    txnSeqno: "YZWX202605090001",
    wechatSubMchId: "889987039"
  }));

  assert.equal(__test__.LIANLIAN_AT_WECHAT_CONFIG_PATH, "/sp/v1/at/secmchconfig");
  assert.deepEqual(body, {
    txn_seqno: "YZWX202605090001",
    sub_mchid: "402605060000097988",
    wechat_sub_mch_id: "889987039",
    wechat_config: {
      pay_type: "WECHAT_APPLET",
      app_id: "wxc257583a047566a3"
    }
  });
});

test("paymentGateway omits payee account type for merchant payees", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildCreatePaymentBody({
    amount: 0.11,
    orderInfo: "野哉-测试",
    openid: "openid-abc",
    txnSeqno: "YZPAY202605090005",
    payeeType: "MCH",
    payeeAcctType: "USEROWN"
  }));

  assert.equal(body.payee_infos[0].payee_type, "MCH");
  assert.equal(Object.prototype.hasOwnProperty.call(body.payee_infos[0], "payee_accttype"), false);
});

test("paymentGateway keeps payee account type for non-merchant payees", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildCreatePaymentBody({
    amount: 0.11,
    orderInfo: "野哉-测试",
    openid: "openid-abc",
    txnSeqno: "YZPAY202605090006",
    payeeType: "USER",
    payeeAcctType: "USEROWN"
  }));

  assert.equal(body.payee_infos[0].payee_type, "USER");
  assert.equal(body.payee_infos[0].payee_accttype, "USEROWN");
});

test("paymentGateway defaults to user fund-process payee for createpay", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildCreatePaymentBody({
    amount: 0.11,
    orderInfo: "野哉-测试",
    openid: "openid-abc",
    txnSeqno: "YZPAY202605090007"
  }));

  assert.deepEqual(body.payee_infos[0], {
    payee_uid: "YEZAI_ENTERPRISE_MAIN",
    payee_accttype: "FUNDPROCESS",
    payee_type: "USER",
    payee_amount: "0.11",
    payee_memo: "野哉二级商户收款"
  });
});

test("paymentGateway falls back to CloudBase service payment notify URL", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => {
    delete process.env.LIANLIAN_PAYMENT_NOTIFY_URL;
    process.env.TCB_ENV = "yezai-3gr73wd48057512e-10f17b581";
    return __test__.buildCreatePaymentBody({
      amount: 0.11,
      orderInfo: "野哉-测试",
      openid: "openid-abc",
      txnSeqno: "YZPAY202605090002"
    });
  });

  assert.equal(
    body.notify_url,
    "https://yezai-3gr73wd48057512e-10f17b581.service.tcloudbase.com/lianlian/payment/notify"
  );
});

test("paymentGateway defaults to delayed share flag and accepts LianLian enum only", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildCreatePaymentBody({
    amount: 0.11,
    orderInfo: "野哉-测试",
    openid: "openid-abc",
    txnSeqno: "YZPAY202605090003",
    shareFlag: "DELAY"
  }));

  assert.equal(body.share_flag, "DELAY");
  assert.throws(() => withPaymentEnv(() => __test__.buildCreatePaymentBody({
    amount: 0.11,
    orderInfo: "野哉-测试",
    openid: "openid-abc",
    txnSeqno: "YZPAY202605090004",
    shareFlag: "N"
  })), /share_flag/);
});

test("paymentGateway normalizes LianLian payload into wx.requestPayment params", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const params = __test__.normalizeWechatPaymentPayload({
    payload: JSON.stringify({
      metadata: JSON.stringify({
        timeStamp: "1705406805",
        nonceStr: "nonce",
        package: "prepay_id=wx123",
        signType: "RSA",
        paySign: "signature",
        appId: "wx123"
      }),
      gateway_url: ""
    })
  });

  assert.equal(params.timeStamp, "1705406805");
  assert.equal(params.nonceStr, "nonce");
  assert.equal(params.package, "prepay_id=wx123");
  assert.equal(params.signType, "RSA");
  assert.equal(params.paySign, "signature");
  assert.equal(params.appId, "wx123");
});

test("paymentGateway recognizes successful payment statuses", () => {
  const { __test__ } = loadPaymentGatewayModule();

  assert.equal(__test__.isPaymentSuccessPayload({ txn_status: "TRADE_SUCCESS" }), true);
  assert.equal(__test__.isPaymentSuccessPayload({ txn_status: "PAYING" }), false);
});

test("paymentGateway allows profit sharing after payment success before order ends", () => {
  const { __test__ } = loadPaymentGatewayModule();

  assert.equal(__test__.isOrderReadyForProfitSharing({
    status: "paid",
    travelDateEnd: "2999-12-31"
  }), true);
  assert.equal(__test__.isOrderReadyForProfitSharing({ status: "traveling" }), true);
  assert.equal(__test__.isOrderReadyForProfitSharing({ status: "completed" }), true);
  assert.equal(__test__.isOrderReadyForProfitSharing({ status: "pending" }), false);
});

test("paymentGateway builds creator and platform profit sharing rows", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const body = withPaymentEnv(() => __test__.buildProfitSharingBody({
    availableAmount: "100.00",
    shareList: [
      {
        shareAmount: "80.00",
        shareMemo: "创作者分账",
        shareUid: "creator-linyue",
        shareUtype: "USER"
      },
      {
        shareAmount: "20.00",
        shareMemo: "平台服务费",
        shareUtype: "MCH"
      }
    ],
    shareTxnSeqno: "YZSHARE202605110001",
    txnSeqno: "YZPAY202605090001"
  }));

  assert.equal(body.mch_id, "402603230000090659");
  assert.equal(body.txn_seqno, "YZPAY202605090001");
  assert.deepEqual(body.share_list, [
    {
      share_uid: "creator-linyue",
      share_utype: "USER",
      share_amount: "80.00",
      share_memo: "创作者分账"
    },
    {
      share_uid: "402603230000090659",
      share_utype: "MCH",
      share_amount: "20.00",
      share_memo: "平台服务费"
    }
  ]);
});

test("paymentGateway rejects profit sharing total above available amount", () => {
  const { __test__ } = loadPaymentGatewayModule();

  assert.throws(() => withPaymentEnv(() => __test__.buildProfitSharingBody({
    availableAmount: "100.00",
    shareList: [
      {
        shareAmount: "80.00",
        shareUid: "creator-linyue",
        shareUtype: "USER"
      },
      {
        shareAmount: "30.00",
        shareUtype: "MCH"
      }
    ],
    txnSeqno: "YZPAY202605090001"
  })), /分账总金额不能超过可分账金额/);
});

test("paymentGateway summarizes refund records once per refund sequence", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const summary = __test__.summarizeRefundRecords([
    {
      id: "notify_1",
      orderNo: "yz-order-001",
      refundSeqno: "YZRF202605120001",
      refundAmount: "0.30",
      status: "SUCCESS"
    },
    {
      id: "create_1",
      orderNo: "yz-order-001",
      refundSeqno: "YZRF202605120001",
      refundAmount: "0.30",
      status: "SUCCESS"
    },
    {
      id: "create_2",
      orderNo: "yz-order-001",
      refundSeqno: "YZRF202605120002",
      refundAmount: "0.20",
      status: "PROCESSING"
    }
  ]);

  assert.equal(summary.successAmountCents, 30);
  assert.equal(summary.processingAmountCents, 20);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.processingCount, 1);
});

test("paymentGateway groups refund summaries by order for profit sharing candidates", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const summaries = __test__.summarizeRefundByOrder([
    {
      orderNo: "yz-order-001",
      refundSeqno: "YZRF202605120001",
      refundAmount: "0.70",
      status: "SUCCESS"
    },
    {
      orderNo: "yz-order-002",
      refundSeqno: "YZRF202605120002",
      refundAmount: "0.15",
      status: "REQUESTING"
    }
  ]);

  assert.equal(summaries["yz-order-001"].successAmountCents, 70);
  assert.equal(summaries["yz-order-002"].processingAmountCents, 15);
});

test("paymentGateway summarizes creator share amount without platform share", () => {
  const { __test__ } = loadPaymentGatewayModule();
  const summary = __test__.summarizeCreatorProfitSharingByOrder([
    {
      orderNo: "yz-order-001",
      shareAmount: "0.11",
      shareTxnSeqno: "YZSHARE202605110001",
      status: "SUCCESS",
      createdAt: 100,
      updatedAt: 200,
      requestSnapshot: {
        share_list: [
          {
            share_uid: "creator-xiaoye",
            share_utype: "USER",
            share_amount: "0.09"
          },
          {
            share_uid: "402603230000090659",
            share_utype: "MCH",
            share_amount: "0.02"
          }
        ]
      }
    }
  ], "creator-xiaoye");

  assert.equal(summary["yz-order-001"].activeAmountCents, 9);
  assert.equal(summary["yz-order-001"].latestShareAmount, "0.09");
  assert.equal(summary["yz-order-001"].latestStatus, "SUCCESS");
});
