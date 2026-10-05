const config = require("./config");
App({
  globalData: { ...config, pendingTicket: "" },
  onShow(options) {
    const referrer = (options && options.referrerInfo) || {};
    const ticket = referrer.extraData && referrer.extraData.ticket;
    if (referrer.appId === config.sourceAppId && /^[a-f0-9]{64}$/.test(ticket || "")) {
      this.globalData.pendingTicket = ticket;
    }
  }
});
