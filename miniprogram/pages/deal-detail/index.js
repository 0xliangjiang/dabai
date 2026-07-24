const { ensureLogin, getCurrentUser, getToken, request } = require("../../utils/api");
const { setConsent } = require("../../utils/privacy");
const { inviterSuffix, inviterQuery } = require("../../utils/share");

Page({
  data: {
    deal: null,
    loading: true,
    notFound: false,
    errorMsg: "",
    copiedIndex: -1,
    showShareModal: false,
    showTimelineGuide: false,
    showPrivacy: false,
    showCopyGate: false
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
    const me = getCurrentUser();
    return {
      title,
      path: this.dealId
        ? `/pages/deal-detail/index?id=${this.dealId}${inviterSuffix(me, true)}`
        : `/pages/deals/index${inviterSuffix(me)}`
    };
  },

  // 分享到朋友圈（用户从右上角「⋯」菜单触发）
  onShareTimeline() {
    const title = this.data.deal ? this.data.deal.title : "优惠线报";
    return {
      title,
      query: inviterQuery(getCurrentUser(), this.dealId ? `id=${this.dealId}` : "")
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
    const requestId = (this.fetchRequestId || 0) + 1;
    this.fetchRequestId = requestId;
    this.setData({ loading: true, notFound: false, errorMsg: "" });
    // 登录尽力而为（用于后续归因），但不阻塞线报查看——接口已公开，分享打开无需登录
    ensureLogin().catch(() => {});
    try {
      const { deal } = await request(`/api/deals/${this.dealId}`);
      if (requestId !== this.fetchRequestId) return;
      deal.steps = (deal.steps || []).map((step) => ({
        ...step,
        images: (step.images || []).map(toDisplayUrl),
        videoUrl: step.videoUrl ? toDisplayUrl(step.videoUrl) : ""
      }));
      this.setData({ deal, loading: false, notFound: false, errorMsg: "" });
      // 上报访问（PV+UV），失败静默
      request(`/api/deals/${this.dealId}/view`, {
        method: "POST",
        data: { visitorId: getVisitorId() }
      }).catch(() => {});
    } catch (error) {
      if (requestId !== this.fetchRequestId) return;
      if (error && error.statusCode === 404) {
        this.setData({ deal: null, loading: false, notFound: true, errorMsg: "" });
        return;
      }
      this.setData({
        deal: null,
        loading: false,
        notFound: false,
        errorMsg: "线报加载失败，请检查网络后重试"
      });
    }
  },

  retryLoad() {
    this.fetchDeal();
  },

  copyStep(event) {
    const index = Number(event.currentTarget.dataset.index);
    const step = this.data.deal.steps[index];
    if (!step || !step.copyValue) return;

    // 复制前拦一道：未登录或没设昵称 → 走 copy-gate（登录+完善资料），完成后再复制
    const user = getCurrentUser();
    if (!getToken() || !user || !user.nickname) {
      this.pendingCopyIndex = index;
      this.setData({ showCopyGate: true });
      return;
    }

    this.doCopy(index);
  },

  // copy-gate 走完（已登录且昵称齐全）→ 复制刚才那一步
  onCopyGatePass() {
    const index = this.pendingCopyIndex;
    this.pendingCopyIndex = -1;
    this.setData({ showCopyGate: false });
    if (typeof index === "number" && index >= 0) this.doCopy(index);
  },

  onCopyGateClose() {
    this.pendingCopyIndex = -1;
    this.setData({ showCopyGate: false });
  },

  doCopy(index) {
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
    wx.previewImage({ urls: (urls || []).filter(Boolean), current });
  },

  onStepImageError(event) {
    const stepIndex = Number(event.currentTarget.dataset.stepIndex);
    const imageIndex = Number(event.currentTarget.dataset.imageIndex);
    if (!Number.isInteger(stepIndex) || !Number.isInteger(imageIndex)) return;
    this.setData({ [`deal.steps[${stepIndex}].images[${imageIndex}]`]: "" });
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

// 设备级访问标识（本地存储，不涉及隐私授权），用于线报访问人数去重
function getVisitorId() {
  let id = "";
  try {
    id = wx.getStorageSync("visitor_id");
  } catch (_e) {
    id = "";
  }
  if (!id) {
    id = `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    try {
      wx.setStorageSync("visitor_id", id);
    } catch (_e) {
      // ignore
    }
  }
  return id;
}
