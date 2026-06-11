const { ensureLogin, request } = require("../../utils/api");
const { hasConsent, setConsent } = require("../../utils/privacy");
const { syncTabBar } = require("../../utils/tabbar");

Page({
  onShareAppMessage() {
    return {
      title: "查优惠神器，粘贴商品就能看预估优惠",
      path: "/pages/home/index"
    };
  },

  onShareTimeline() {
    return {
      title: "查优惠神器，粘贴商品就能看预估优惠"
    };
  },

  data: {
    rawContent: "",
    loading: false,
    result: null,
    errorMsg: "",
    copied: "",
    showPrivacy: false
  },

  async onLoad() {
    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }
    await this.loginQuietly();
  },

  onShow() {
    syncTabBar(this);
    if (hasConsent()) {
      this.autoPasteFromClipboard();
    }
  },

  async onPrivacyAgree() {
    setConsent();
    getApp().resolvePrivacy(true);
    this.setData({ showPrivacy: false });
    await this.loginQuietly();
    this.autoPasteFromClipboard();
  },

  onPrivacyReject() {
    getApp().resolvePrivacy(false);
    this.setData({ showPrivacy: false });
    wx.showToast({ title: "同意后才能使用查询功能", icon: "none" });
  },

  onInput(event) {
    this.setData({ rawContent: event.detail.value });
  },

  async pasteFromClipboard() {
    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }
    const { content, error } = await this.readClipboard();
    if (error) {
      // 隐私接口被拦截（隐私指引未配置/未通过，或开发工具未勾选"不校验隐私接口"）
      wx.showModal({
        title: "无法读取剪贴板",
        content: "请确认已同意隐私授权。开发调试请在开发者工具勾选「不校验隐私接口」；线上需在小程序后台通过《用户隐私保护指引》申报剪切板。",
        showCancel: false
      });
      return;
    }
    if (!content) {
      wx.showToast({ title: "剪贴板为空", icon: "none" });
      return;
    }

    this.fillRawContent(content);
    wx.showToast({ title: "已粘贴", icon: "success" });
  },

  async autoPasteFromClipboard() {
    const { content } = await this.readClipboard();
    if (!content || !looksLikeProductContent(content)) return;
    if (content === this.data.rawContent.trim()) return;

    this.fillRawContent(content);
  },

  async convert() {
    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }
    if (!this.data.rawContent.trim()) {
      wx.showToast({ title: "请先粘贴内容", icon: "none" });
      return;
    }

    this.setData({ loading: true, errorMsg: "", copied: "" });
    try {
      await ensureLogin();
      const result = await request("/api/conversions", {
        method: "POST",
        data: { rawContent: this.data.rawContent }
      });
      this.setData({ result: this.formatResult(result) });
    } catch (error) {
      this.setData({
        result: null,
        errorMsg: error.error || "未识别到商品"
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  copyPassword() {
    this.copyResult("password", this.data.result.generatedPassword).catch(() => {
      this.showManualCopyTip();
    });
  },

  copyLink() {
    this.copyResult("link", this.data.result.generatedShortUrl || this.data.result.generatedClickUrl).catch(() => {
      this.showManualCopyTip();
    });
  },

  // 一键复制失败（如剪贴板权限受限）时，引导用户长按文本手动复制
  showManualCopyTip() {
    wx.showModal({
      title: "一键复制不可用",
      content: "请长按上方口令或链接文字，选中后手动复制。",
      showCancel: false,
      confirmText: "知道了"
    });
  },

  formatResult(result) {
    return {
      ...result,
      itemPrice: ((result.itemPriceCents || 0) / 100).toFixed(2),
      estimatedPoints: Math.round(result.estimatedRebateCents || 0),
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

  async copyResult(copyType, content) {
    if (!content) {
      wx.showToast({ title: "暂无可复制内容", icon: "none" });
      return;
    }
    await ensureLogin();
    await wx.setClipboardData({ data: content });
    this.setData({ copied: copyType });
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => {
      this.setData({ copied: "" });
    }, 1500);
    await request(`/api/conversions/${this.data.result.id}/copy`, {
      method: "POST",
      data: { copyType }
    }).catch(() => {});
  },

  onUnload() {
    clearTimeout(this.copiedTimer);
  },

  async loginQuietly() {
    try {
      await ensureLogin();
    } catch (_error) {
      wx.showToast({ title: "请先完成微信登录", icon: "none" });
    }
  },

  readClipboard() {
    return new Promise((resolve) => {
      wx.getClipboardData({
        success(result) {
          resolve({ content: (result.data || "").trim(), error: null });
        },
        fail(error) {
          console.warn("getClipboardData failed:", error.errMsg || error);
          resolve({ content: "", error: error.errMsg || "fail" });
        }
      });
    });
  },

  clearContent() {
    if (!this.data.rawContent) return;
    this.setData({ rawContent: "", result: null, errorMsg: "", copied: "" });
  },

  fillRawContent(content) {
    this.setData({
      rawContent: content,
      result: null,
      errorMsg: "",
      copied: ""
    });
  }
});

function looksLikeProductContent(content) {
  return /https?:\/\/\S+/i.test(content) ||
    /[￥$][^￥$]{4,}[￥$]/.test(content) ||
    /(淘宝|天猫|京东|拼多多|唯品会|口令|券|到手|下单|返利)/.test(content);
}
