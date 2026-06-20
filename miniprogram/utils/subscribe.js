const { ensureLogin, request } = require("./api");

// 拉起线报订阅（必须在用户点击事件里调用）。同意一次 = +1 条可推送额度。
// 对勾选「总是保持以上选择」的用户不弹窗、静默授权——多点几个入口即可静默累积。
// 返回 { ok, remaining }；silent=true 时不弹任何 toast（用于次要入口）。
async function subscribeDeals(options = {}) {
  const { silent = false } = options;
  let templateId = "";
  try {
    const r = await request("/api/subscriptions/me");
    templateId = r.templateId;
  } catch (_e) {
    templateId = "";
  }
  if (!templateId) {
    if (!silent) wx.showToast({ title: "订阅暂未开放", icon: "none" });
    return { ok: false, remaining: 0 };
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: async (result) => {
        if (result[templateId] !== "accept") {
          if (!silent) wx.showToast({ title: "已取消订阅", icon: "none" });
          resolve({ ok: false, remaining: 0 });
          return;
        }
        try {
          await ensureLogin();
          const { remaining } = await request("/api/subscriptions", { method: "POST" });
          if (!silent) wx.showToast({ title: "订阅成功，新线报会通知你", icon: "none" });
          resolve({ ok: true, remaining });
        } catch (error) {
          if (!silent) wx.showToast({ title: (error && error.error) || "订阅失败，请重试", icon: "none" });
          resolve({ ok: false, remaining: 0 });
        }
      },
      fail: () => {
        if (!silent) wx.showToast({ title: "订阅失败，请重试", icon: "none" });
        resolve({ ok: false, remaining: 0 });
      }
    });
  });
}

module.exports = { subscribeDeals };
