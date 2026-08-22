function syncTabBar(page) {
  if (!page || typeof page.getTabBar !== "function") return;

  const tabBar = page.getTabBar();
  if (!tabBar) return;

  const route = `/${page.route}`;
  const selected = tabBar.data.list.findIndex((item) => item.pagePath === route);
  if (selected < 0) return;

  tabBar.setData({
    selected,
    list: tabBar.data.list.map((item, index) => ({
      ...item,
      activeClass: index === selected ? "active" : ""
    }))
  });
}

module.exports = {
  syncTabBar
};
