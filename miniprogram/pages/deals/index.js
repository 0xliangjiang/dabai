const { ensureLogin, request } = require("../../utils/api");
const { syncTabBar } = require("../../utils/tabbar");

Page({
  onShareAppMessage() {
    return {
      title: "最新优惠线报，按步骤照着做就行",
      path: "/pages/deals/index"
    };
  },

  onShareTimeline() {
    return {
      title: "最新优惠线报，按步骤照着做就行"
    };
  },

  data: {
    deals: [],
    loading: true,
    showEmpty: false
  },

  async onShow() {
    syncTabBar(this);
    await this.fetchDeals();
  },

  async onPullDownRefresh() {
    await this.fetchDeals();
    wx.stopPullDownRefresh();
  },

  async fetchDeals() {
    try {
      await ensureLogin();
      const data = await request("/api/deals");
      this.setData({
        deals: data.deals.map((deal) => ({
          ...deal,
          dateText: formatDate(deal.createdAt)
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
