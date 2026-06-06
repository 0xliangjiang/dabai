const { request } = require("../../utils/api");

Page({
  data: {
    orders: [],
    showEmpty: true
  },

  async onShow() {
    try {
      const data = await request("/api/orders/me");
      this.setData({
        orders: data.orders.map((order) => ({
          ...order,
          estimatedCommission: (order.estimatedCommissionCents / 100).toFixed(2)
        })),
        showEmpty: data.orders.length === 0
      });
    } catch (_error) {
      this.setData({ orders: [], showEmpty: true });
    }
  }
});
