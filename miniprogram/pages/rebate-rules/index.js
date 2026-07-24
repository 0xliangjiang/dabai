const { getCurrentUser } = require("../../utils/api");
const { inviterSuffix, inviterQuery } = require("../../utils/share");

Page({
  onShareAppMessage() {
    return {
      title: "查优惠神器，粘贴商品就能看预估优惠",
      path: `/pages/home/index${inviterSuffix(getCurrentUser())}`
    };
  },

  onShareTimeline() {
    return {
      title: "查优惠神器，粘贴商品就能看预估优惠",
      query: inviterQuery(getCurrentUser())
    };
  },
});
