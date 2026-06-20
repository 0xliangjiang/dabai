const { ensureLogin, getCurrentUser, request } = require("../../utils/api");
const { hasConsent, setConsent } = require("../../utils/privacy");
const { syncTabBar } = require("../../utils/tabbar");
const { inviterSuffix, inviterQuery } = require("../../utils/share");
const { ensureNickname } = require("../../utils/guard");
const { subscribeDeals } = require("../../utils/subscribe");

Page({
  onShareAppMessage() {
    return {
      title: "查优惠神器，粘贴商品就能看预估优惠",
      path: `/pages/home/index${inviterSuffix(getCurrentUser())}`
    };
  },

  onShareTimeline() {
    return {
      title: "查优惠神器，粘贴商品就能看预估优惠",
      query: inviterQuery(getCurrentUser())
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

  async onSubscribe() {
    await subscribeDeals();
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
    if (this.data.loading) return;

    const { content } = await this.readClipboard();
    if (!content || !looksLikeProductContent(content)) return;
    if (content === this.data.rawContent.trim()) return;
    // 剪贴板里是本次会话刚复制出去的文案/链接时跳过，防止自我循环
    if (content === this.lastCopiedContent) return;
    // 用户在弹窗里拒绝过的内容不再重复询问
    if (content === this.dismissedContent) return;

    // 没有查询结果时直接填入；有结果时弹窗确认，避免静默覆盖用户正在看的内容
    if (!this.data.result) {
      this.fillRawContent(content);
      return;
    }
    wx.showModal({
      title: "检测到新的商品内容",
      content: "是否替换当前内容并查询新的优惠？",
      confirmText: "查询",
      cancelText: "保留当前",
      success: (res) => {
        if (res.confirm) {
          this.fillRawContent(content);
          this.convert();
        } else {
          this.dismissedContent = content;
        }
      }
    });
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
    this.copyResult("password", this.data.result.shareText).catch(() => {
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
    const displayLink = result.generatedShortUrl || result.generatedClickUrl || "";
    return {
      ...result,
      itemPrice: ((result.itemPriceCents || 0) / 100).toFixed(2),
      estimatedPoints: Math.round(result.estimatedRebateCents || 0),
      commissionPercent: `${Math.round((result.commissionRate || 0) * 100)}%`,
      displayLink,
      platformLabel: this.platformLabel(result.platform),
      hasPassword: Boolean(result.generatedPassword),
      shareText: buildShareText(result, displayLink)
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
    this.lastCopiedContent = content;
    this.setData({ copied: copyType });
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => {
      this.setData({ copied: "" });
    }, 1500);
    this.showOpenAppGuide(copyType);
    await request(`/api/conversions/${this.data.result.id}/copy`, {
      method: "POST",
      data: { copyType }
    }).catch(() => {});
  },

  // 复制成功后引导用户去对应平台下单，每个结果只弹一次，避免打扰
  showOpenAppGuide(copyType) {
    const result = this.data.result;
    if (!result || this.guidedResultId === result.id) return;
    this.guidedResultId = result.id;

    const app = this.platformLabel(result.platform);
    const content = copyType === "password"
      ? `打开「${app}」App，会自动弹出该商品，确认下单即可获得返积分。`
      : `打开「${app}」App 或浏览器，粘贴刚复制的链接即可打开商品，下单后返积分。`;
    wx.showModal({
      title: `已复制，去${app}下单`,
      content,
      showCancel: false,
      confirmText: "知道了"
    });
  },

  onUnload() {
    clearTimeout(this.copiedTimer);
  },

  async loginQuietly() {
    try {
      await ensureLogin();
      // 登录后没昵称 → 引导去「我的」页完善
      ensureNickname();
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

// 拼完整分享文案：口令 + 商品标题 + 短链，粘到淘宝弹窗/搜索框或浏览器都能打开
function buildShareText(result, displayLink) {
  if (!result.generatedPassword) return displayLink;
  const parts = [`${result.generatedPassword} 「${result.itemTitle}」`];
  parts.push("复制整段内容，打开「淘宝」即可查看");
  if (displayLink) {
    parts.push(`或点击链接直接打开 ${displayLink}`);
  }
  return parts.join("\n");
}

function looksLikeProductContent(content) {
  return /https?:\/\/\S+/i.test(content) ||
    /[￥$][^￥$]{4,}[￥$]/.test(content) ||
    /(淘宝|天猫|京东|拼多多|唯品会|口令|券|到手|下单|返利)/.test(content);
}
