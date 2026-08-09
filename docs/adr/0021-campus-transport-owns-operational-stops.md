# ADR 0021：校园交通拥有运营站点，校园地图拥有空间地点

状态：Accepted

## 决议

校园交通以自己的稳定 Stop ID 保存方向、服务类型、线路模式、班次和运营生命周期，并通过可复核的 Stop–Place 关联单向引用校园地图的稳定 Place ID。我们不让两边共享一张“地点/站点”表：真实 CUHK 数据中同一物理地点存在 Upward、Downward 与 PSLB 等多个运营 Stop，同一 Route 又会因日期或发车分钟采用不同站序；合并身份会把易变运营事实泄漏进地图，而完全复制地点则会制造两套空间真值。

## 后果

- Campus map 的 Place 改名或调整插画位置不改变 Place ID；退役时提供 redirect 或 tombstone，不复用 ID。
- Campus transport 不能按名称自动合并 Stop 与 Place，也不能反向写入坐标或连通边。
- 若未来官方交通 feed 提供 boarding-point 坐标，Transport 可作为 Stop 运营事实保存；它不替代 Campus map 的 Place 坐标，也不自动证明两者同一。
- 地图尚未集成时 Stop–Place 关联可以为空；产品从站到站能力开始，不以直线距离补造步行段。
- 只有经证据确认的关联可进入发布读模型，候选吸附和近邻匹配继续留在 staging。
