const { ensureLogin, request } = require("../../utils/api");
const { hasConsent, setConsent } = require("../../utils/privacy");

Page({
  data: {
    orderNumber: "",
    submitting: false,
    showPrivacy: false
  },

  onOrderNumberChange(event) {
    this.setData({ orderNumber: event.detail.value });
  },

  async onPrivacyAgree() {
    setConsent();
    getApp().resolvePrivacy(true);
    this.setData({ showPrivacy: false });
  },

  onPrivacyReject() {
    getApp().resolvePrivacy(false);
    this.setData({ showPrivacy: false });
    wx.showToast({ title: "同意后才能使用绑定功能", icon: "none" });
  },

  async submit() {
    if (this.data.submitting) return;

    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }

    const orderNumber = this.data.orderNumber.trim();
    if (!orderNumber || orderNumber.length < 4) {
      wx.showToast({ title: "请输入至少4位订单号", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    try {
      await ensureLogin();
      const res = await request("/api/orders/bind", {
        method: "POST",
        data: { orderNumber }
      });
      wx.showModal({
        title: "绑定成功",
        content: `「${res.order?.itemTitle || "订单"}」已绑定到您的账户，预计返利已入账。`,
        showCancel: false,
        confirmText: "查看订单",
        success: () => {
          wx.switchTab({ url: "/pages/profile/index" });
        }
      });
    } catch (error) {
      wx.showToast({ title: error.error || "绑定失败，请检查订单号", icon: "none", duration: 3000 });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
