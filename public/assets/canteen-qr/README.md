# Canteen ordering links

点餐入口已改为食堂详情页的「点击点餐」按钮，链接配置在：

```text
src/lib/canteen-order-urls.ts
```

按食堂 **name**（优先）或 UUID 映射到外部点餐页，与原二维码编码的 URL 一致：

```text
https://meal.pin2eat.com/store/4898/takeout   # ws-can
https://meal.pin2eat.com/store/5198/takeout   # uc-can
https://meal.pin2eat.com/store/5500/takeout   # na-can
https://shop.ichefpos.com/store/UQftKWxU/instore/qrcode?tableName=VDE  # mc-can
https://www.ebeneezers.com/                 # Ebeneezer's
```

本目录下的 PNG 为历史二维码资产，页面不再展示。需要时可参考 `scripts/regen-canteen-qr.py` 重新生成。

Launcher icons: `public/assets/canteen-icons/` — name by canteen **name** or UUID.
