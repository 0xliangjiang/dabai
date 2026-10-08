Page({
  onShow() {
    const state = getApp().globalData;
    if (state.accountEntryRequested && state.pendingTicket && !this.routing) {
      state.accountEntryRequested = false;
      this.routing = true;
      wx.navigateTo({ url: "/pages/home/index?mode=account", complete: () => { this.routing = false; } });
    }
  },
  onShareAppMessage() { return { title: "良匠工具箱：目标清单、单位换算、日期计算", path: "/pages/toolbox/index" }; }
});
