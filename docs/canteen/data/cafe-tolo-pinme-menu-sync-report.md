## Cafe Tolo ← pinme:4899

- crawled: dine-in + takeout channels merged
- raw: `docs/canteen/data/pinme-4899-raw.json`
- sync: `docs/canteen/data/Cafe Tolo-pinme-menu-sync.json`
- items=68 (excluded 外賣自取飲品打包費)
- sections: 特飲(18), 咖啡(12), 套餐(6), 甜品(6), 雪糕(5), 新上架(4), 其他(4), 奶昔(4), 多杯飲品優惠(3), 湯(2), 純茶(2), 小食(1), 甜品.(1)

Apply in admin → Cafe Tolo → 外部菜单同步 (paste the sync JSON), or:

```text
node --env-file=.env.local --import tsx scripts/apply-pinme-menu-sync.ts
```

(only if `Cafe Tolo` exists in `canteens` and the apply script includes it)
