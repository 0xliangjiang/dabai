const { syncTabBar } = require("../../utils/tabbar");

Page({
  onShow() {
    syncTabBar(this);
  }
});
