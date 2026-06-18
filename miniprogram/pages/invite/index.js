const { ensureLogin, getCurrentUser, request } = require("../../utils/api");
const { hasConsent, setConsent } = require("../../utils/privacy");
const { ensureNickname } = require("../../utils/guard");

function fen2yuan(cents) {
  return ((cents || 0) / 100).toFixed(2);
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    enabled: true,
    downlineCount: 0,
    earnedText: "0.00",
    pendingText: "0.00",
    downlines: [],
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
    // 没昵称 → 引导去完善（邀请前先有名字）
    if (!ensureNickname()) return;
    this.setData({ isLoggedIn: Boolean(getCurrentUser()) });
    try {
      const [r, d] = await Promise.all([
        request("/api/users/me/referral"),
        request("/api/users/me/downline").catch(() => ({ downlines: [] }))
      ]);
      this.setData({
        loading: false,
        enabled: Boolean(r.enabled),
        downlineCount: r.downlineCount || 0,
        earnedText: fen2yuan(r.earnedCents),
        pendingText: fen2yuan(r.pendingCents),
        downlines: (d.downlines || []).map((f) => ({
          id: f.id,
          name: f.nickname || "微信用户",
          joinedAt: formatDate(f.createdAt),
          contributedText: fen2yuan(f.contributedCents)
        }))
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
