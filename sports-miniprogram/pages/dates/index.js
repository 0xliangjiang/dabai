const toolbox = require("../../utils/toolbox");
Page({
  data: { modes: ["相隔天数", "日期加减"], modeIndex: 0, start: "", end: "", daysInput: "", result: "", detail: "", error: "" },
  onLoad() { const today = toolbox.today(); this.setData({ start: today, end: today }); },
  chooseMode(event) { this.setData({ modeIndex: Number(event.detail.value), result: "", detail: "", error: "" }); },
  chooseStart(event) { this.setData({ start: event.detail.value, result: "", detail: "", error: "" }); },
  chooseEnd(event) { this.setData({ end: event.detail.value, result: "", detail: "", error: "" }); },
  inputDays(event) { this.setData({ daysInput: event.detail.value, result: "", detail: "", error: "" }); },
  calculate() {
    try {
      if (this.data.modeIndex === 0) {
        const days = toolbox.dateDifference(this.data.start, this.data.end);
        this.setData({ result: `${Math.abs(days)} 天`, detail: days === 0 ? "两个日期是同一天。" : days > 0 ? `结束日期比开始日期晚 ${days} 天。` : `结束日期比开始日期早 ${Math.abs(days)} 天。`, error: "" });
      } else {
        const result = toolbox.addDays(this.data.start, this.data.daysInput);
        const days = Number(this.data.daysInput);
        this.setData({ result, detail: `${this.data.start} ${days >= 0 ? '加上' : '减去'} ${Math.abs(days)} 天`, error: "" });
      }
    } catch (error) { this.setData({ result: "", detail: "", error: error.message }); }
  }
});
