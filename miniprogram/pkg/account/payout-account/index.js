const { getCurrentUser } = require("../../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { getPayoutAccount, savePayoutAccount } = require("../api/referral");

function buildEmptyForm() {
  return {
    accountName: "",
    phone: "",
    bankName: "",
    bankAccountNo: "",
    idNumberLast4: ""
  };
}

function normalizeForm(form) {
  const source = form && typeof form === "object" ? form : buildEmptyForm();
  return {
    accountName: String(source.accountName || "").trim(),
    phone: String(source.phone || "").replace(/\s+/g, ""),
    bankName: String(source.bankName || "").trim(),
    bankAccountNo: String(source.bankAccountNo || "").replace(/\s+/g, ""),
    idNumberLast4: String(source.idNumberLast4 || "").trim().toUpperCase()
  };
}

function validateForm(form) {
  const errors = {};
  if (!form.accountName) {
    errors.accountName = "请填写收款人姓名";
  }
  if (!/^1\d{10}$/.test(form.phone)) {
    errors.phone = "请填写 11 位收款手机号";
  }
  if (!form.bankName) {
    errors.bankName = "请填写收款银行";
  }
  if (!/^\d{10,30}$/.test(form.bankAccountNo)) {
    errors.bankAccountNo = "请填写正确的银行卡号";
  }
  if (form.idNumberLast4 && !/^[0-9A-Z]{4}$/.test(form.idNumberLast4)) {
    errors.idNumberLast4 = "请填写证件后四位";
  }
  return errors;
}

function buildFormFromAccount(account) {
  const source = account && typeof account === "object" ? account : {};
  return normalizeForm({
    accountName: source.accountName,
    phone: source.phone,
    bankName: source.bankName,
    bankAccountNo: source.bankAccountNo,
    idNumberLast4: source.idNumberLast4
  });
}

function confirmPayoutAccountSubmit() {
  return new Promise((resolve) => {
    wx.showModal({
      title: "提交前请确认",
      content: "请检查你的收款信息，信息错误会导致打款失败！",
      confirmText: "继续提交",
      cancelText: "返回修改",
      success: (result) => resolve(Boolean(result && result.confirm)),
      fail: () => resolve(false)
    });
  });
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    saving: false,
    errorText: "",
    payoutAccount: null,
    form: buildEmptyForm(),
    formErrors: {}
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const user = await getCurrentUser();
      if (!user) {
        this.setData({
          loading: false,
          loggedIn: false,
          payoutAccount: null,
          form: buildEmptyForm(),
          formErrors: {}
        });
        return;
      }

      const result = await getPayoutAccount();
      const payoutAccount = result && result.payoutAccount ? result.payoutAccount : null;
      this.setData({
        loading: false,
        loggedIn: true,
        payoutAccount,
        form: buildFormFromAccount(payoutAccount),
        formErrors: {}
      });
    } catch (error) {
      console.error("Failed to load payout account", error);
      this.setData({
        loading: false,
        loggedIn: true,
        errorText: "收款信息加载失败，请稍后重试。"
      });
    }
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        goTopLevel(TOP_LEVEL_ROUTES.profile);
      }
    });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) {
      return;
    }

    const nextForm = normalizeForm({
      ...this.data.form,
      [field]: event.detail ? event.detail.value || "" : ""
    });

    this.setData({
      form: nextForm,
      formErrors: {
        ...this.data.formErrors,
        [field]: ""
      }
    });
  },

  async submit() {
    if (this.data.saving) {
      return;
    }

    const form = normalizeForm(this.data.form);
    const formErrors = validateForm(form);
    if (Object.keys(formErrors).length) {
      this.setData({ formErrors });
      wx.showToast({
        title: Object.values(formErrors)[0],
        icon: "none"
      });
      return;
    }

    const confirmed = await confirmPayoutAccountSubmit();
    if (!confirmed) {
      return;
    }

    this.setData({
      saving: true
    });

    try {
      const payoutAccount = await savePayoutAccount(form);
      this.setData({
        saving: false,
        payoutAccount,
        form: buildFormFromAccount(payoutAccount),
        formErrors: {}
      });
      wx.showToast({
        title: "已完成登记",
        icon: "success"
      });
    } catch (error) {
      console.error("Failed to save payout account", error);
      this.setData({
        saving: false
      });
      wx.showToast({
        title: error && error.message ? error.message : "保存提交失败",
        icon: "none"
      });
    }
  }
});
