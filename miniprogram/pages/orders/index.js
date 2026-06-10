const { ensureLogin, request } = require("../../utils/api");
const { syncTabBar } = require("../../utils/tabbar");

Page({
  data: {
    orders: [],
    loading: true,
    showEmpty: false
  },

  async onShow() {
    syncTabBar(this);
    await this.fetchOrders();
  },

  async onPullDownRefresh() {
    await this.fetchOrders();
    wx.stopPullDownRefresh();
  },

  async fetchOrders() {
    try {
      await ensureLogin();
      const data = await request("/api/orders/me");
      this.setData({
        orders: data.orders.map((order) => ({
          ...order,
          estimatedCommission: (order.estimatedCommissionCents / 100).toFixed(2)
        })),
        loading: false,
        showEmpty: data.orders.length === 0
      });
    } catch (_error) {
      this.setData({ orders: [], loading: false, showEmpty: true });
    }
  }
});
