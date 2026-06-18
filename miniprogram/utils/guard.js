const { getCurrentUser } = require("./api");

// 软引导完善昵称：已登录但没昵称时，跳到「我的」页填写。
// 未登录不在这里强制（首页有静默登录，登录后再引导）；返回 false 表示已重定向。
function ensureNickname() {
  const user = getCurrentUser();
  if (user && !user.nickname) {
    wx.switchTab({ url: "/pages/profile/index" });
    return false;
  }
  return true;
}

module.exports = { ensureNickname };
