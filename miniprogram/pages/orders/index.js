const { ensureLogin, request } = require("../../utils/api");
const { syncTabBar } = require("../../utils/tabbar");
const { ensureNickname } = require("../../utils/guard");

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
    try {
      await ensureLogin();
      if (!ensureNickname()) return; // 没昵称 → 已跳转去完善
    } catch (_e) {
      // 登录失败下方 fetchOrders 会再处理
    }
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
      const orders = data.orders.map((order) => decorateOrder(order));
      for (const order of orders) {
        if (order.rebateStatus === "available") settledPoints += order.points;
        else if (order.rebateStatus === "pending") pendingPoints += order.points;
      }
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
  },

  // 刷新返利：后台已结算但这里仍显示待返利时，点一下重算台账（已结算→积分到账）
  async refreshRebate(event) {
    const { id, index } = event.currentTarget.dataset;
    if (this.data.orders[index] && this.data.orders[index].refreshing) return;
    this.setData({ [`orders[${index}].refreshing`]: true });
    try {
      const { order } = await request(`/api/orders/me/${id}/recheck`, { method: "POST" });
      if (!order) {
        wx.showToast({ title: "未找到该订单", icon: "none" });
        return;
      }
      const before = this.data.orders[index] ? this.data.orders[index].rebateStatus : "pending";
      const decorated = decorateOrder(order);
      this.setData({ [`orders[${index}]`]: decorated });
      this.recomputeTotals();
      if (decorated.rebateStatus === "available" && before !== "available") {
        wx.showToast({ title: `返利已到账 +${decorated.points} 积分`, icon: "success" });
      } else if (decorated.rebateStatus === "available") {
        wx.showToast({ title: "返利已到账", icon: "success" });
      } else if (decorated.rebateStatus === "reversed") {
        wx.showToast({ title: "该订单已退款，无返利", icon: "none" });
      } else {
        wx.showToast({ title: "订单仍在结算中，确认收货后约 7-15 天到账", icon: "none" });
      }
    } catch (error) {
      wx.showToast({ title: (error && error.error) || "刷新失败，请重试", icon: "none" });
    } finally {
      if (this.data.orders[index]) this.setData({ [`orders[${index}].refreshing`]: false });
    }
  },

  copyOrderNumber(event) {
    const no = event.currentTarget.dataset.no;
    if (!no) return;
    wx.setClipboardData({ data: String(no) }); // 系统自带「已复制」提示
  },

  recomputeTotals() {
    let settledPoints = 0;
    let pendingPoints = 0;
    for (const order of this.data.orders) {
      if (order.rebateStatus === "available") settledPoints += order.points;
      else if (order.rebateStatus === "pending") pendingPoints += order.points;
    }
    this.setData({ settledPoints, pendingPoints });
  }
});

function decorateOrder(order) {
  const points = Math.round(order.userRebateCents || 0);
  const rebateStatus = order.rebateStatus || (order.status === "settled" ? "available" : "pending");
  return {
    ...order,
    points,
    rebateStatus,
    settled: rebateStatus === "available",
    canRefresh: rebateStatus === "pending",
    refreshing: false,
    rebateLabel: REBATE_LABEL[rebateStatus] || "预估",
    statusLabel: STATUS_LABEL[order.status] || "处理中",
    statusClass: STATUS_CLASS[order.status] || "orange",
    payTimeText: formatTime(order.payTime),
    payAmountText: ((order.payAmountCents || 0) / 100).toFixed(2)
  };
}

const REBATE_LABEL = {
  available: "已结算",
  pending: "待结算",
  reversed: "已退款",
  none: "待匹配"
};

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
