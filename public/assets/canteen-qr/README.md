# Canteen QR assets

Name files by canteen **name** (preferred) or UUID:

```text
public/assets/canteen-qr/ws-can.png
public/assets/canteen-qr/<canteen-id>.png
```

Also accepted: `.webp`, `.jpg`, `.jpeg`, `.svg`.

Launcher icons: `public/assets/canteen-icons/` with the same naming.

## Pin Me ordering links

Pin Me stores here use `all_share_table=1`. A QR that encodes
`/store/{id}/table/1` (or `table_name=1`) joins the shared dine-in cart, so
browsers can show dishes other people already ordered.

For website “扫码下单” assets, encode the **takeout** entry instead (no table):

```text
https://meal.pin2eat.com/store/4898/takeout   # ws-can
https://meal.pin2eat.com/store/5198/takeout   # uc-can
https://meal.pin2eat.com/store/5500/takeout   # na-can
```

Regenerate with `python scripts/regen-canteen-qr.py` if those PNGs need refreshing.
