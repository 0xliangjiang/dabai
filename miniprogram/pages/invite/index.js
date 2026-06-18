const { ensureLogin, getCurrentUser, request } = require("../../utils/api");
const { hasConsent, setConsent } = require("../../utils/privacy");

function fen2yuan(cents) {
  return ((cents || 0) / 100).toFixed(2);
}

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    enabled: true,
    downlineCount: 0,
    earnedText: "0.00",
    pendingText: "0.00",
    showShareModal: false,
    showTimelineGuide: false,
    showPrivacy: false
  },

  onShareAppMessage() {
    const user = getCurrentUser();
    const inviter = user && user.id ? user.id : "";
    return {
      title: "送你一个查优惠神器，粘贴商品就能看预估返利",
      path: inviter ? `/pages/home/index?inviter=${inviter}` : "/pages/home/index"
    };
  },

  onShareTimeline() {
    const user = getCurrentUser();
    const inviter = user && user.id ? user.id : "";
    return {
      title: "送你一个查优惠神器，粘贴商品就能看预估返利",
      query: inviter ? `inviter=${inviter}` : ""
    };
  },

  async onShow() {
    if (wx.showShareMenu) {
      wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
    }
    await this.refresh();
  },

  async refresh() {
    try {
      await ensureLogin();
    } catch (_e) {
      this.setData({ isLoggedIn: false, loading: false });
      return;
    }
    this.setData({ isLoggedIn: Boolean(getCurrentUser()) });
    try {
      const r = await request("/api/users/me/referral");
      this.setData({
        loading: false,
        enabled: Boolean(r.enabled),
        downlineCount: r.downlineCount || 0,
        earnedText: fen2yuan(r.earnedCents),
        pendingText: fen2yuan(r.pendingCents)
      });
    } catch (_e) {
      this.setData({ loading: false });
    }
  },

  openShareModal() {
    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }
    this.setData({ showShareModal: true, showTimelineGuide: false });
  },

  closeShareModal() {
    this.setData({ showShareModal: false, showTimelineGuide: false });
  },

  showTimelineTutorial() {
    this.setData({ showTimelineGuide: true });
  },

  onPrivacyAgree() {
    setConsent();
    getApp().resolvePrivacy(true);
    this.setData({ showPrivacy: false, showShareModal: true });
  },

  onPrivacyReject() {
    getApp().resolvePrivacy(false);
    this.setData({ showPrivacy: false });
    wx.showToast({ title: "同意后才能分享", icon: "none" });
  },

  stopProp() {}
});
