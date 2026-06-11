const { ensureLogin, getCurrentUser, loginWithWechat, logout, request, uploadFile } = require("../../utils/api");
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
    isLoggedIn: false,
    userId: "",
    identityText: "未登录",
    loginTitle: "登录后查看优惠",
    loginDesc: "",
    loggingIn: false,
    showPrivacy: false,
    showMoreLinks: false,
    totalPoints: 0,
    checkin: { todayChecked: false, streak: 0 },
    checkinLoading: false,
    nickname: "",
    avatarUrl: "",
    editingProfile: false,
    draftNickname: "",
    draftAvatarUrl: "",
    draftAvatarTemp: "",
    savingProfile: false,
    availableBalance: 0,
    availablePoints: 0,
    balanceText: "0.00",
    withdrawals: [],
    showWithdrawForm: false,
    withdrawAmount: "",
    withdrawPayType: "wechat",
    withdrawAccount: "",
    withdrawNotes: "",
    submittingWithdraw: false
  },

  onShow() {
    syncTabBar(this);
    this.refreshUser();
    this.syncUserFromServer();
  },

  async syncUserFromServer() {
    if (!getCurrentUser()) return;
    try {
      const [{ user }, checkin, withdrawalData] = await Promise.all([
        request("/api/users/me"),
        request("/api/checkins/me"),
        request("/api/withdrawals/me").catch(() => ({ availableBalance: 0, withdrawals: [] }))
      ]);
      if (user) {
        wx.setStorageSync("user", user);
        this.refreshUser();
      }
      this.setData({
        totalPoints: checkin.totalPoints || 0,
        checkin: { todayChecked: checkin.todayChecked, streak: checkin.streak },
        availableBalance: withdrawalData.availableBalance || 0,
        availablePoints: withdrawalData.availableBalance || 0,
        balanceText: ((withdrawalData.availableBalance || 0) / 100).toFixed(2),
        withdrawals: (withdrawalData.withdrawals || []).slice(0, 5).map((w) => ({
          ...w,
          createdAt: w.createdAt ? w.createdAt.slice(0, 10) : "",
          amountText: (w.amountCents / 100).toFixed(2)
        }))
      });
    } catch (_error) {
      // 静默失败，下次进入再同步
    }
  },

  refreshUser() {
    const user = getCurrentUser();
    this.setData({
      isLoggedIn: Boolean(user),
      userId: user?.id || "",
      nickname: user?.nickname || "",
      avatarUrl: user?.avatarUrl || "",
      displayAvatar: toDisplayUrl(user?.avatarUrl || ""),
      identityText: user ? "已登录" : "未登录",
      loginTitle: user ? (user.nickname || "微信已登录") : "登录后查看优惠",
      loginDesc: user ? `账号 ${user.id}` : ""
    });
  },

  startEditProfile() {
    this.setData({
      editingProfile: true,
      draftNickname: this.data.nickname,
      draftAvatarUrl: this.data.avatarUrl,
      draftAvatarTemp: ""
    });
  },

  cancelEditProfile() {
    this.setData({ editingProfile: false });
  },

  onChooseAvatar(event) {
    this.setData({ draftAvatarTemp: event.detail.avatarUrl });
  },

  onNicknameInput(event) {
    this.setData({ draftNickname: event.detail.value });
  },

  async saveProfile() {
    if (this.data.savingProfile) return;
    const nickname = this.data.draftNickname.trim();
    if (!nickname) {
      wx.showToast({ title: "请填写昵称", icon: "none" });
      return;
    }

    this.setData({ savingProfile: true });
    try {
      let avatarUrl = this.data.draftAvatarUrl;
      if (this.data.draftAvatarTemp) {
        const upload = await uploadFile("/api/uploads/avatar", this.data.draftAvatarTemp);
        avatarUrl = upload.url || avatarUrl;
      }

      const payload = { nickname };
      if (avatarUrl) payload.avatarUrl = avatarUrl;
      const { user } = await request("/api/users/me/profile", {
        method: "POST",
        data: payload
      });

      wx.setStorageSync("user", user);
      this.setData({ editingProfile: false });
      this.refreshUser();
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.error || "保存失败，请重试", icon: "none" });
    } finally {
      this.setData({ savingProfile: false });
    }
  },

  async onPrivacyAgree() {
    setConsent();
    getApp().resolvePrivacy(true);
    this.setData({ showPrivacy: false });
    await this.login();
  },

  onPrivacyReject() {
    getApp().resolvePrivacy(false);
    this.setData({ showPrivacy: false });
    wx.showToast({ title: "同意后才能登录", icon: "none" });
  },

  async login() {
    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }
    this.setData({ loggingIn: true });
    try {
      await loginWithWechat();
      this.refreshUser();
      wx.showToast({ title: "登录成功", icon: "success" });
      // 首次登录且未设置昵称时，自动展开资料面板（头像/昵称都支持微信一键带入）
      if (!this.data.nickname) {
        this.startEditProfile();
      }
    } catch (_error) {
      wx.showToast({ title: "登录失败，请重试", icon: "none" });
    } finally {
      this.setData({ loggingIn: false });
    }
  },

  async checkIn() {
    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }
    if (this.data.checkin.todayChecked || this.data.checkinLoading) return;

    this.setData({ checkinLoading: true });
    try {
      await ensureLogin();
      const result = await request("/api/checkins", { method: "POST" });
      this.setData({
        checkin: { todayChecked: true, streak: result.streak },
        totalPoints: result.totalPoints
      });
      this.refreshUser();
      wx.showToast({ title: `签到成功 +${result.pointsAwarded}积分`, icon: "none" });
    } catch (error) {
      if (error && error.error === "今日已签到") {
        this.setData({ "checkin.todayChecked": true });
      }
      wx.showToast({ title: error.error || "签到失败，请重试", icon: "none" });
    } finally {
      this.setData({ checkinLoading: false });
    }
  },

  stopProp() {},

  openWithdrawForm() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    this.setTabBarHidden(true);
    this.setData({
      showWithdrawForm: true,
      withdrawAmount: "",
      withdrawPayType: "wechat",
      withdrawAccount: "",
      withdrawNotes: ""
    });
  },

  closeWithdrawForm() {
    this.setTabBarHidden(false);
    this.setData({ showWithdrawForm: false });
  },

  // 自定义 tab bar 是独立组件层，z-index 压不住，弹窗期间直接隐藏
  setTabBarHidden(hidden) {
    const tabBar = typeof this.getTabBar === "function" && this.getTabBar();
    if (tabBar) {
      tabBar.setData({ hidden });
    }
  },

  onWithdrawAmountInput(e) {
    this.setData({ withdrawAmount: e.detail.value });
  },

  onWithdrawAccountInput(e) {
    this.setData({ withdrawAccount: e.detail.value });
  },

  onWithdrawNotesInput(e) {
    this.setData({ withdrawNotes: e.detail.value });
  },

  selectPayType(e) {
    this.setData({ withdrawPayType: e.currentTarget.dataset.type });
  },

  async submitWithdraw() {
    if (this.data.submittingWithdraw) return;
    const amountYuan = parseFloat(this.data.withdrawAmount);
    if (!amountYuan || amountYuan < 10) {
      wx.showToast({ title: "最低提现金额为 ¥10", icon: "none" });
      return;
    }
    const amountCents = Math.floor(amountYuan * 100);
    if (amountCents > this.data.availableBalance) {
      wx.showToast({ title: "超出可提现余额", icon: "none" });
      return;
    }
    if (!this.data.withdrawAccount.trim()) {
      wx.showToast({ title: "请填写收款账号", icon: "none" });
      return;
    }

    this.setData({ submittingWithdraw: true });
    try {
      await ensureLogin();
      await request("/api/withdrawals", {
        method: "POST",
        data: {
          amountCents,
          payAccount: this.data.withdrawAccount.trim(),
          payType: this.data.withdrawPayType,
          notes: this.data.withdrawNotes.trim() || undefined
        }
      });
      wx.showToast({ title: "提现申请已提交", icon: "success" });
      this.closeWithdrawForm();
      await this.syncUserFromServer();
    } catch (error) {
      wx.showToast({ title: error.error || "提交失败，请重试", icon: "none" });
    } finally {
      this.setData({ submittingWithdraw: false });
    }
  },

  toggleMoreLinks() {
    this.setData({ showMoreLinks: !this.data.showMoreLinks });
  },

  logout() {
    logout();
    this.refreshUser();
    wx.showToast({ title: "已退出", icon: "none" });
  }
});

function toDisplayUrl(url) {
  if (!url) return "";
  return url.startsWith("/") ? `${getApp().globalData.apiBaseUrl}${url}` : url;
}
