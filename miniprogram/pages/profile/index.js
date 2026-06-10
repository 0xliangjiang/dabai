const { getCurrentUser, loginWithWechat, logout, request, uploadFile } = require("../../utils/api");
const { hasConsent, setConsent } = require("../../utils/privacy");
const { syncTabBar } = require("../../utils/tabbar");

Page({
  data: {
    isLoggedIn: false,
    userId: "",
    identityText: "未登录",
    loginTitle: "登录后查看优惠",
    loginDesc: "使用微信登录，订单和优惠记录会跟随你的账号。",
    loggingIn: false,
    showPrivacy: false,
    nickname: "",
    avatarUrl: "",
    editingProfile: false,
    draftNickname: "",
    draftAvatarUrl: "",
    draftAvatarTemp: "",
    savingProfile: false
  },

  onShow() {
    syncTabBar(this);
    this.refreshUser();
    this.syncUserFromServer();
  },

  async syncUserFromServer() {
    if (!getCurrentUser()) return;
    try {
      const { user } = await request("/api/users/me");
      if (user) {
        wx.setStorageSync("user", user);
        this.refreshUser();
      }
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
      loginDesc: user ? `账号 ${user.id}` : "使用微信登录，订单和优惠记录会跟随你的账号。"
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
    } catch (_error) {
      wx.showToast({ title: "登录失败，请重试", icon: "none" });
    } finally {
      this.setData({ loggingIn: false });
    }
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
