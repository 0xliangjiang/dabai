const tabBarMap = {
  "/pages/home/index": 0,
  "/pages/records/index": 1,
  "/pages/orders/index": 2,
  "/pages/profile/index": 3
};

function syncTabBar(page) {
  if (!page || typeof page.getTabBar !== "function") return;

  const tabBar = page.getTabBar();
  if (!tabBar) return;

  const route = `/${page.route}`;
  const selected = tabBarMap[route];
  if (selected === undefined) return;

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
