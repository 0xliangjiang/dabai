Page({
  onShow() {
    if (getApp().globalData.pendingTicket && !this.routing) {
      this.routing = true;
      wx.navigateTo({ url: "/pages/home/index", complete: () => { this.routing = false; } });
    }
  },
  onShareAppMessage() { return { title: "良匠工具箱：目标清单、单位换算、日期计算", path: "/pages/toolbox/index" }; }
});
