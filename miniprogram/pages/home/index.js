const { ensureLogin, request } = require("../../utils/api");
const { syncTabBar } = require("../../utils/tabbar");

Page({
  data: {
    rawContent: "",
    loading: false,
    result: null
  },

  async onLoad() {
    await this.loginQuietly();
  },

  onShow() {
    syncTabBar(this);
  },

  onInput(event) {
    this.setData({ rawContent: event.detail.value });
  },

  async convert() {
    if (!this.data.rawContent.trim()) {
      wx.showToast({ title: "请先粘贴内容", icon: "none" });
      return;
    }

    this.setData({ loading: true });
    try {
      await ensureLogin();
      const result = await request("/api/conversions", {
        method: "POST",
        data: { rawContent: this.data.rawContent }
      });
      this.setData({ result: this.formatResult(result) });
    } catch (error) {
      wx.showToast({ title: error.error || "查询失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  copyPassword() {
    this.copyResult("password", this.data.result.generatedPassword);
  },

  copyLink() {
    this.copyResult("link", this.data.result.generatedShortUrl || this.data.result.generatedClickUrl);
  },

  formatResult(result) {
    return {
      ...result,
      itemPrice: ((result.itemPriceCents || 0) / 100).toFixed(2),
      estimatedRebate: ((result.estimatedRebateCents || 0) / 100).toFixed(2),
      commissionPercent: `${Math.round((result.commissionRate || 0) * 100)}%`,
      displayLink: result.generatedShortUrl || result.generatedClickUrl || "",
      platformLabel: this.platformLabel(result.platform),
      hasPassword: Boolean(result.generatedPassword)
    };
  },

  platformLabel(platform) {
    return {
      taobao: "淘宝",
      jd: "京东",
      pdd: "拼多多",
      vip: "唯品会"
    }[platform] || "商品";
  },

  async copyResult(copyType, data) {
    await ensureLogin();
    await wx.setClipboardData({ data });
    await request(`/api/conversions/${this.data.result.id}/copy`, {
      method: "POST",
      data: { copyType }
    });
  },

  async loginQuietly() {
    try {
      await ensureLogin();
    } catch (_error) {
      wx.showToast({ title: "请先完成微信登录", icon: "none" });
    }
  }
});
