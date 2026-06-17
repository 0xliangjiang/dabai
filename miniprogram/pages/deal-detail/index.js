const { ensureLogin, request } = require("../../utils/api");
const { setConsent } = require("../../utils/privacy");

Page({
  data: {
    deal: null,
    loading: true,
    notFound: false,
    copiedIndex: -1,
    showShareModal: false,
    showTimelineGuide: false,
    showPrivacy: false
  },

  // 复制等隐私接口被拦截时，由 app.js 触发本页弹出隐私确认
  onPrivacyAgree() {
    setConsent();
    getApp().resolvePrivacy(true);
    this.setData({ showPrivacy: false });
  },

  onPrivacyReject() {
    getApp().resolvePrivacy(false);
    this.setData({ showPrivacy: false });
    wx.showToast({ title: "同意后才能复制内容", icon: "none" });
  },

  onShareAppMessage() {
    const title = this.data.deal ? this.data.deal.title : "优惠线报";
    return {
      title,
      path: this.dealId ? `/pages/deal-detail/index?id=${this.dealId}` : "/pages/deals/index"
    };
  },

  // 分享到朋友圈（用户从右上角「⋯」菜单触发）
  onShareTimeline() {
    const title = this.data.deal ? this.data.deal.title : "优惠线报";
    return {
      title,
      query: this.dealId ? `id=${this.dealId}` : ""
    };
  },

  async onLoad(options) {
    this.dealId = options.id || "";
    // 开启「⋯」菜单里的转发与分享到朋友圈
    if (wx.showShareMenu) {
      wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
    }
    await this.fetchDeal();
  },

  openShareModal() {
    this.setData({ showShareModal: true, showTimelineGuide: false });
  },

  closeShareModal() {
    this.setData({ showShareModal: false, showTimelineGuide: false });
  },

  showTimelineTutorial() {
    this.setData({ showTimelineGuide: true });
  },

  stopProp() {},

  async fetchDeal() {
    if (!this.dealId) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    // 登录尽力而为（用于后续归因），但不阻塞线报查看——接口已公开，分享打开无需登录
    ensureLogin().catch(() => {});
    try {
      const { deal } = await request(`/api/deals/${this.dealId}`);
      deal.steps = (deal.steps || []).map((step) => ({
        ...step,
        images: (step.images || []).map(toDisplayUrl),
        videoUrl: step.videoUrl ? toDisplayUrl(step.videoUrl) : ""
      }));
      this.setData({ deal, loading: false });
    } catch (_error) {
      this.setData({ loading: false, notFound: true });
    }
  },

  copyStep(event) {
    const index = Number(event.currentTarget.dataset.index);
    const step = this.data.deal.steps[index];
    if (!step || !step.copyValue) return;

    wx.setClipboardData({
      data: step.copyValue,
      success: () => {
        this.setData({ copiedIndex: index });
        clearTimeout(this.copiedTimer);
        this.copiedTimer = setTimeout(() => {
          this.setData({ copiedIndex: -1 });
        }, 1500);
      },
      fail: (error) => {
        console.warn("setClipboardData failed:", error.errMsg || error);
        wx.showModal({
          title: "复制失败",
          content: "开发调试请在开发者工具勾选「不校验隐私接口」；线上需在小程序后台《用户隐私保护指引》申报剪切板。",
          showCancel: false
        });
      }
    });
  },

  previewImage(event) {
    const { urls, current } = event.currentTarget.dataset;
    wx.previewImage({ urls, current });
  },

  onUnload() {
    clearTimeout(this.copiedTimer);
  },

  backToList() {
    wx.switchTab({ url: "/pages/deals/index" });
  }
});

function toDisplayUrl(url) {
  if (!url) return "";
  return url.startsWith("/") ? `${getApp().globalData.apiBaseUrl}${url}` : url;
}
