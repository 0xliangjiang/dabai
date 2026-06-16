const { ensureLogin, request } = require("../../utils/api");
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
    orders: [],
    loading: true,
    showEmpty: false,
    settledPoints: 0,
    pendingPoints: 0
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
      let settledPoints = 0;
      let pendingPoints = 0;
      const orders = data.orders.map((order) => {
        const points = Math.round(order.userRebateCents || 0);
        const settled = order.status === "settled";
        if (settled) {
          settledPoints += points;
        } else if (order.status !== "refunded" && order.status !== "invalid") {
          pendingPoints += points;
        }
        return {
          ...order,
          points,
          settled,
          statusLabel: STATUS_LABEL[order.status] || "处理中",
          statusClass: STATUS_CLASS[order.status] || "orange",
          payTimeText: formatTime(order.payTime),
          payAmountText: ((order.payAmountCents || 0) / 100).toFixed(2)
        };
      });
      this.setData({
        orders,
        settledPoints,
        pendingPoints,
        loading: false,
        showEmpty: orders.length === 0
      });
    } catch (_error) {
      this.setData({ orders: [], loading: false, showEmpty: true });
    }
  }
});

const STATUS_LABEL = {
  paid: "已付款",
  received: "已收货",
  settled: "已结算",
  refunded: "已退款",
  invalid: "已失效"
};

const STATUS_CLASS = {
  paid: "orange",
  received: "blue",
  settled: "green",
  refunded: "gray",
  invalid: "gray"
};

function formatTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
