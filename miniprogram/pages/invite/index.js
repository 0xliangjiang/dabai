const {
  ensureLogin,
  getCurrentUser,
  getToken,
  isTimelineSinglePage,
  request
} = require("../../utils/api");
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
    showPrivacy: false,
    singlePageMode: false,
    needsLogin: false,
    loggingIn: false
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

  onLoad(options) {
    // 页面参数再兜底捕获一次，确保朋友圈单页模式切换到完整小程序后仍能绑定邀请人。
    const inviter = options && (options.inviter || options.scene);
    if (inviter) {
      getApp().captureInviter({ query: { inviter } });
    }
  },

  async onShow() {
    const singlePageMode = isTimelineSinglePage();
    if (singlePageMode) {
      this.setData({
        singlePageMode: true,
        needsLogin: false,
        loading: false,
        errorMsg: ""
      });
      return;
    }
    if (wx.showShareMenu) {
      wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
    }
    if (!getToken()) {
      this.setData({
        singlePageMode: false,
        needsLogin: true,
        loading: false,
        errorMsg: ""
      });
      return;
    }
    this.setData({ singlePageMode: false, needsLogin: false });
    await this.refresh();
  },

  startLogin() {
    if (!hasConsent()) {
      this.privacyAction = "login";
      this.setData({ showPrivacy: true });
      return;
    }
    this.loginAndBind();
  },

  async loginAndBind() {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true, errorMsg: "" });
    try {
      let expectedInviter = getApp().globalData.pendingInviter || "";
      try {
        expectedInviter = wx.getStorageSync("pending_inviter") || expectedInviter;
      } catch (_error) {
        // 使用 App 中保留的邀请参数。
      }
      const result = await ensureLogin();
      const accepted = Boolean(
        expectedInviter &&
        result.user &&
        result.user.inviterId === expectedInviter
      );
      this.setData({ needsLogin: false, loggingIn: false, errorMsg: "" });
      if (expectedInviter) {
        wx.showToast({
          title: accepted ? "已接受好友邀请" : "登录成功",
          icon: "success"
        });
        setTimeout(() => {
          wx.reLaunch({ url: "/pages/home/index?from=invite" });
        }, 600);
        return;
      }
      await this.refresh();
    } catch (_error) {
      this.setData({
        loggingIn: false,
        needsLogin: true,
        errorMsg: "登录暂时没有成功，请点击重试"
      });
    }
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
    if (this.data.needsLogin) {
      this.startLogin();
      return;
    }
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
      this.privacyAction = "share";
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

  openPoster() {
    if (!hasConsent()) {
      this.privacyAction = "poster";
      this.setData({ showPrivacy: true });
      return;
    }
    this.closeShareModal();
    wx.navigateTo({ url: "/pages/invite-poster/index" });
  },

  onPrivacyAgree() {
    setConsent();
    getApp().resolvePrivacy(true);
    this.setData({ showPrivacy: false });
    const action = this.privacyAction;
    this.privacyAction = "";
    if (action === "login") {
      this.loginAndBind();
      return;
    }
    if (action === "poster") {
      this.openPoster();
      return;
    }
    this.openShareModal();
  },

  onPrivacyReject() {
    getApp().resolvePrivacy(false);
    this.privacyAction = "";
    this.setData({ showPrivacy: false });
    wx.showToast({ title: "同意后才能继续使用", icon: "none" });
  },

  stopProp() {}
});
