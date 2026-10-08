const toolbox = require("../../utils/toolbox");
Page({
  data: { groups: toolbox.UNIT_GROUPS.map(group => group.name), groupIndex: 0, units: toolbox.UNIT_GROUPS[0].units,
    fromIndex: 0, toIndex: 1, amount: "", result: "", equation: "", error: "" },
  inputAmount(event) { this.setData({ amount: event.detail.value, result: "", equation: "", error: "" }); },
  chooseGroup(event) {
    const groupIndex = Number(event.detail.value);
    if (!toolbox.UNIT_GROUPS[groupIndex]) return;
    this.setData({ groupIndex, units: toolbox.UNIT_GROUPS[groupIndex].units, fromIndex: 0, toIndex: 1, result: "", equation: "", error: "" });
  },
  chooseFrom(event) { this.setData({ fromIndex: Number(event.detail.value), result: "", equation: "", error: "" }); },
  chooseTo(event) { this.setData({ toIndex: Number(event.detail.value), result: "", equation: "", error: "" }); },
  swapUnits() { this.setData({ fromIndex: this.data.toIndex, toIndex: this.data.fromIndex, result: "", equation: "", error: "" }); },
  calculate() {
    try {
      const result = toolbox.convert(this.data.amount, this.data.groupIndex, this.data.fromIndex, this.data.toIndex);
      this.setData({ result: `${result.output} ${result.to}`, equation: `${result.input} ${result.from} = ${result.output} ${result.to}`, error: "" });
    } catch (error) { this.setData({ result: "", equation: "", error: error.message }); }
  }
});
