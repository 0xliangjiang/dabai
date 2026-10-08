const config = require("./config");
App({
  globalData: { ...config, pendingTicket: "", accountEntryRequested: false },
  onShow(options) {
    this.globalData.accountEntryRequested = false;
    const referrer = (options && options.referrerInfo) || {};
    const ticket = referrer.extraData && referrer.extraData.ticket;
    if (referrer.appId === config.sourceAppId && /^[a-f0-9]{64}$/.test(ticket || "") && ticket !== this.lastHandoffTicket) {
      this.lastHandoffTicket = ticket;
      this.globalData.pendingTicket = ticket;
      this.globalData.accountEntryRequested = true;
    }
  }
});
