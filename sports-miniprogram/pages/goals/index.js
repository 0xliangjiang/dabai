const goals = require("../../utils/goals");
Page({
  data: { items: [], completed: 0, goalInput: "", editingId: "", error: "", ready: false, focusInput: false },
  onShow() { this.loadGoals(); },
  loadGoals() {
    try { this.showItems(goals.readGoals()); this.setData({ ready: true, error: "" }); }
    catch (error) { this.setData({ ready: false, error: error.message }); }
  },
  showItems(items) { this.setData({ items, completed: items.filter(item => item.done).length }); },
  save(items) {
    try { this.showItems(goals.writeGoals(items)); this.setData({ error: "" }); return true; }
    catch (error) { this.setData({ error: error.message }); return false; }
  },
  inputGoal(event) { this.setData({ goalInput: event.detail.value, error: "" }); },
  submitGoal() {
    if (!this.data.ready) return;
    try {
      const title = goals.validateTitle(this.data.goalInput);
      let items = this.data.items;
      if (this.data.editingId) items = items.map(item => item.id === this.data.editingId ? Object.assign({}, item, { title }) : item);
      else {
        if (items.length >= goals.LIMIT) throw new Error("最多保存 100 个目标，请先删除不需要的记录");
        const createdAt = Date.now();
        const id = `${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
        items = [{ id, title, done: false, createdAt }].concat(items);
      }
      if (this.save(items)) { this.cancelEdit(); wx.showToast({ title: "已保存", icon: "success" }); }
    } catch (error) { this.setData({ error: error.message, focusInput: true }); }
  },
  toggleGoal(event) {
    if (!this.data.ready) return;
    const id = event.currentTarget.dataset.id;
    this.save(this.data.items.map(item => item.id === id ? Object.assign({}, item, { done: !item.done }) : item));
  },
  editGoal(event) {
    const item = this.data.items.find(item => item.id === event.currentTarget.dataset.id);
    if (item && this.data.ready) this.setData({ goalInput: item.title, editingId: item.id, error: "", focusInput: true });
  },
  cancelEdit() { this.setData({ goalInput: "", editingId: "", focusInput: false }); },
  deleteGoal(event) {
    if (!this.data.ready) return;
    const id = event.currentTarget.dataset.id;
    const item = this.data.items.find(item => item.id === id);
    if (!item) return;
    wx.showModal({ title: "删除目标", content: `删除“${item.title}”？此操作无法撤销。`, confirmText: "删除", confirmColor: "#ad493d",
      success: result => {
        if (result.confirm && this.data.ready && this.save(this.data.items.filter(item => item.id !== id)) && this.data.editingId === id) this.cancelEdit();
      } });
  }
});
