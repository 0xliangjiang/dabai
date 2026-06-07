const { getCurrentUser, loginWithWechat, logout } = require("../../utils/api");
const { syncTabBar } = require("../../utils/tabbar");

Page({
  data: {
    isLoggedIn: false,
    userId: "",
    identityText: "未登录",
    loginTitle: "登录后查看返利",
    loginDesc: "使用微信登录，订单和返利记录会跟随你的账号。",
    loggingIn: false
  },

  onShow() {
    syncTabBar(this);
    this.refreshUser();
  },

  refreshUser() {
    const user = getCurrentUser();
    this.setData({
      isLoggedIn: Boolean(user),
      userId: user?.id || "",
      identityText: user ? "已登录" : "未登录",
      loginTitle: user ? "微信已登录" : "登录后查看返利",
      loginDesc: user ? `账号 ${user.id}` : "使用微信登录，订单和返利记录会跟随你的账号。"
    });
  },

  async login() {
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
