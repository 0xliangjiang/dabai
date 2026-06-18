const { ensureLogin, getCurrentUser, request } = require("../../utils/api");
const { syncTabBar } = require("../../utils/tabbar");
const { inviterSuffix, inviterQuery } = require("../../utils/share");
const { ensureNickname } = require("../../utils/guard");

Page({
  onShareAppMessage(res) {
    const me = getCurrentUser();
    // 卡片上的「分享」按钮触发：分享对应的那条线报
    if (res && res.from === "button" && res.target) {
      const { id, title } = res.target.dataset;
      if (id) {
        return {
          title: title || "优惠线报",
          path: `/pages/deal-detail/index?id=${id}${inviterSuffix(me, true)}`
        };
      }
    }
    return {
      title: "最新优惠线报，按步骤照着做就行",
      path: `/pages/deals/index${inviterSuffix(me)}`
    };
  },

  onShareTimeline() {
    return {
      title: "最新优惠线报，按步骤照着做就行",
      query: inviterQuery(getCurrentUser())
    };
  },

  noop() {},

  data: {
    deals: [],
    loading: true,
    showEmpty: false,
    subscribeTemplateId: "",
    subscribeRemaining: 0
  },

  async onShow() {
    syncTabBar(this);
    // 已登录但没昵称 → 引导去完善（匿名浏览不强制）
    if (!ensureNickname()) return;
    await this.fetchDeals();
    this.refreshSubscription();
  },

  async refreshSubscription() {
    try {
      await ensureLogin();
      const { templateId, remaining } = await request("/api/subscriptions/me");
      this.setData({ subscribeTemplateId: templateId, subscribeRemaining: remaining });
    } catch (_error) {
      // 静默失败
    }
  },

  async subscribe() {
    const templateId = this.data.subscribeTemplateId;
    if (!templateId) {
      wx.showToast({ title: "订阅暂未开放", icon: "none" });
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: async (result) => {
        if (result[templateId] !== "accept") {
          wx.showToast({ title: "已取消订阅", icon: "none" });
          return;
        }
        try {
          await ensureLogin();
          const { remaining } = await request("/api/subscriptions", { method: "POST" });
          this.setData({ subscribeRemaining: remaining });
          wx.showToast({ title: "订阅成功，新线报会通知你", icon: "none" });
        } catch (error) {
          wx.showToast({ title: error.error || "订阅失败，请重试", icon: "none" });
        }
      },
      fail: () => {
        wx.showToast({ title: "订阅失败，请重试", icon: "none" });
      }
    });
  },

  async onPullDownRefresh() {
    await this.fetchDeals();
    wx.stopPullDownRefresh();
  },

  async fetchDeals() {
    try {
      ensureLogin().catch(() => {});
      const data = await request("/api/deals");
      this.setData({
        deals: data.deals.map((deal) => ({
          ...deal,
          dateText: formatDate(deal.publishedAt)
        })),
        loading: false,
        showEmpty: data.deals.length === 0
      });
    } catch (_error) {
      this.setData({ deals: [], loading: false, showEmpty: true });
    }
  },

  openDeal(event) {
    wx.navigateTo({ url: `/pages/deal-detail/index?id=${event.currentTarget.dataset.id}` });
  }
});

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
}
