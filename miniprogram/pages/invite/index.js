const { ensureLogin, getCurrentUser, request } = require("../../utils/api");
const { hasConsent, setConsent } = require("../../utils/privacy");
const { trackEvent } = require("../../utils/analytics");
const { centsToPoints } = require("../../utils/points");

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
    loadingMore: false,
    errorMsg: "",
    loadMoreError: "",
    enabled: true,
    downlineCount: 0,
    earnedText: "0.00",
    pendingText: "0.00",
    downlines: [],
    page: 1,
    hasMore: false,
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
    const requestId = (this.fetchRequestId || 0) + 1;
    this.fetchRequestId = requestId;
    this.downlineRequestId = (this.downlineRequestId || 0) + 1;
    this.setData({ loading: true, errorMsg: "", loadMoreError: "" });
    try {
      await ensureLogin();
    } catch (_e) {
      if (requestId !== this.fetchRequestId) return;
      this.setData({
        isLoggedIn: false,
        loading: false,
        errorMsg: "登录失败，请检查网络后重试"
      });
      return;
    }
    this.setData({ isLoggedIn: Boolean(getCurrentUser()) });
    try {
      const [r, d] = await Promise.all([
        request("/api/users/me/referral"),
        request("/api/users/me/downline?page=1&pageSize=20")
      ]);
      if (requestId !== this.fetchRequestId) return;
      this.setData({
        loading: false,
        errorMsg: "",
        enabled: Boolean(r.enabled),
        downlineCount: r.downlineCount || 0,
        earnedText: centsToPoints(r.earnedCents),
        pendingText: centsToPoints(r.pendingCents),
        page: 1,
        hasMore: Boolean(d.hasMore),
        downlines: (d.downlines || []).map((f) => ({
          id: f.id,
          name: f.nickname || "微信用户",
          initial: (f.nickname || "友").slice(0, 1),
          joinedAt: formatDate(f.createdAt),
          contributedText: centsToPoints(f.contributedCents)
        }))
      });
    } catch (_e) {
      if (requestId !== this.fetchRequestId) return;
      this.setData({
        loading: false,
        errorMsg: "邀请数据加载失败，请重试"
      });
    }
  },

  retryLoad() {
    this.refresh();
  },

  async onPullDownRefresh() {
    await this.refresh();
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loadMoreError) return;
    await this.loadMoreDownlines();
  },

  async loadMoreDownlines() {
    const page = this.data.page + 1;
    const requestId = (this.downlineRequestId || 0) + 1;
    this.downlineRequestId = requestId;
    this.setData({ loadingMore: true, loadMoreError: "" });
    try {
      const data = await request(`/api/users/me/downline?page=${page}&pageSize=20`);
      if (requestId !== this.downlineRequestId) return;
      const incoming = (data.downlines || []).map((f) => ({
        id: f.id,
        name: f.nickname || "微信用户",
        initial: (f.nickname || "友").slice(0, 1),
        joinedAt: formatDate(f.createdAt),
        contributedText: centsToPoints(f.contributedCents)
      }));
      this.setData({
        downlines: this.data.downlines.concat(incoming),
        page,
        hasMore: Boolean(data.hasMore),
        loadingMore: false,
        loadMoreError: ""
      });
    } catch (_error) {
      if (requestId !== this.downlineRequestId) return;
      this.setData({ loadingMore: false, loadMoreError: "加载更多失败" });
    }
  },

  retryLoadMore() {
    this.loadMoreDownlines();
  },

  openShareModal() {
    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }
    const user = getCurrentUser();
    if (!user || !user.nickname) {
      wx.showToast({ title: "请先在“我的”页设置昵称", icon: "none" });
      setTimeout(() => wx.switchTab({ url: "/pages/profile/index" }), 500);
      return;
    }
    trackEvent("invite_share_opened");
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
    this.setData({ showPrivacy: false });
    this.openShareModal();
  },

  onPrivacyReject() {
    getApp().resolvePrivacy(false);
    this.setData({ showPrivacy: false });
    wx.showToast({ title: "同意后才能分享", icon: "none" });
  },

  stopProp() {}
});
