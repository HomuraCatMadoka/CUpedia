# ADR 0038：用高德热点命中 canonical Campus Map 卡片

状态：Accepted

## 决议

高德浏览底图开启 POI 图层和 hotspot 交互。高德负责绘制与命中测试；Campus Map 在页面加载时
一次性读取已审核的 `(provider, providerPlaceId) → Building | Place` 映射。热点点击后只按完整
高德对象 ID 在内存中精确查表：命中便以 canonical ID 打开正式卡片，未命中或映射加载失败便
显示不带 canonical 动作的瞬时供应商卡。

名称、别名、类别和距离都不能在点击路径中猜测映射。点击不会再请求服务器，也没有
“先临时、稍后升级”的异步状态。provider ID、名称和坐标不进入 browse scene、URL 或 history；
正式卡片、添加设施和 deep link 只认 canonical ID。

CUpedia 只为自身 Place 设施绘制类别 marker/cluster，不再为所有 Building 复制一层蓝色建筑
marker。这样不会让同一建筑同时拥有高德图标与 CUpedia 图标两个入口。

编辑室外位置时仍可使用高德反向地理编码作为瞬时位置参考；确认后的事实仍只有 canonical WGS84
坐标。Provider mapping registry 仍是受审计的治理记录；浏览端只消费最小只读投影，不读取来源、
操作者或候选匹配信息。

## 后果

- 高德现有可点击对象成为映射覆盖率清单；遗漏映射会安全降级为瞬时卡，不会误开另一实体。
- Building/Place 正式卡片仍只有一个 canonical 身份、一个 URL 和一套动作。
- 浏览路径没有模糊匹配、逐次网络查询、异步升级或第二套建筑 marker 生命周期。
- 更换地图供应商需要重建外部映射，但不需要迁移 canonical 身份、卡片或 history 状态。
