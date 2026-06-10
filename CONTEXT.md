# CUpedia — 寻味CU

CUpedia is a wiki application for CUHK students ("你的中大百科全书"). The 寻味CU (Flavor Seek CU) module adds canteen and delivery food discovery, rating, and ranking capabilities.

## Language

**Venue** (餐饮场所):
A place that serves food, either an on-campus canteen or an off-campus delivery merchant.
_Avoid_: Restaurant, eatery, shop, store

**Canteen** (食堂):
An on-campus dining venue operated by or affiliated with a CUHK college (e.g., 善衡书院餐厅).
_Avoid_: Cafeteria, dining hall, food court

**Delivery Merchant** (外卖商家):
An off-campus food vendor offering delivery to CUHK (e.g., 麦当劳).
_Avoid_: Restaurant, takeaway, delivery store

**Dish** (菜品):
A food item available at a single Venue. Has a name, price, photo, optional admin-authored description, and aggregated star rating.
_Avoid_: Menu item, meal, food, product

**Venue Rating** (食堂/商家评分):
A holistic rating of a Venue, independent of the ratings of its individual dishes. Captures overall judgment across aspects like ambiance, price, location, and service. Each Venue has exactly one aggregated rating with its own review count.
_Avoid_: Canteen score, overall rating

**Dish Rating** (菜品评分):
A star rating (1–5) for a specific Dish. Aggregated into an average score and review count shown on the Dish card and detail page.
_Avoid_: Food rating, item score

**Review** (评价):
A user-submitted text evaluation accompanied by a star rating. Belongs to either a Venue or a Dish, never both. Requires login; subject to admin moderation before publication.
_Avoid_: Comment, feedback, rating alone

**Leaderboard** (排行榜):
A ranked list of Venues or Dishes, ordered by average rating score with review count displayed for transparency. Filterable by time window (1 month, 3 months, All time).
_Avoid_: Top list, rankings, chart

**Recommended Dishes** (推荐菜品):
Admin-curated list of dishes highlighted on a Venue's header. Displayed as pill-shaped labels.
_Avoid_: Featured items, highlights, picks

### Permission Model

| Action | Anonymous | Authenticated User | Admin |
|---|---|---|---|
| View venues, dishes, ratings | ✅ | ✅ | ✅ |
| Rate a dish or venue | ❌ | ✅ | ✅ |
| Write a text review | ❌ | ✅ (pending moderation) | ✅ |
| Delete own review | — | ✅ | ✅ |
| Propose a new dish | ❌ | ✅ (pending approval) | ✅ |
| Approve/reject proposed dishes | ❌ | ❌ | ✅ |
| Edit dish info (photo, name, price, description) | ❌ | ❌ | ✅ |
| Add/remove a venue | ❌ | ❌ | ✅ |
| Curate recommended dishes | ❌ | ❌ | ✅ |
| Upload menu scan photos | ❌ | ✅ | ✅ |
| Delete any review | ❌ | ❌ | ✅ |
