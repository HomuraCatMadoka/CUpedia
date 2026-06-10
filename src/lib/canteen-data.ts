// ==========================================================================
// 寻味CU — Sample data & types
// Static data for the canteen prototype. Replace with DB queries later.
// ==========================================================================

export interface Venue {
  slug: string;
  name: string;
  type: "canteen" | "delivery";
  description: string | null;
  rating: number;           // independent venue rating, 0–5
  reviewCount: number;
  recommendedDishes: string[];
  dishCount: number;
  tags?: string[];           // delivery-specific tags
}

export interface Dish {
  slug: string;
  name: string;
  venueSlug: string;
  price: number;             // HKD
  rating: number;            // 0–5
  reviewCount: number;
  description: string | null;
  imageSeed: string;         // picsum.photos seed
  ratingDistribution: [number, number, number, number, number]; // 5★ to 1★ percentages
  likeCount: number;
  dislikeCount: number;
}

export interface DishReview {
  type: "like" | "dislike";
  author: string;
  text: string;
}

export interface Review {
  author: string;
  initial: string;
  date: string;
  rating: number;
  text: string;
}

// ==========================================================================
// Canteens
// ==========================================================================
export const canteens: Venue[] = [
  {
    slug: "shaw",
    name: "善衡书院餐厅",
    type: "canteen",
    description: null,
    rating: 4.2,
    reviewCount: 328,
    recommendedDishes: ["红烧牛肉面", "叉烧饭", "番茄炒蛋饭"],
    dishCount: 12,
  },
  {
    slug: "lee-woo-sing",
    name: "和声书院餐厅",
    type: "canteen",
    description: null,
    rating: 4.0,
    reviewCount: 256,
    recommendedDishes: ["咖喱鸡饭", "扬州炒饭"],
    dishCount: 10,
  },
  {
    slug: "wu-yee-sun",
    name: "伍宜孙书院餐厅",
    type: "canteen",
    description: null,
    rating: 3.9,
    reviewCount: 201,
    recommendedDishes: ["烧味双拼", "冻柠茶"],
    dishCount: 9,
  },
  {
    slug: "chung-chi",
    name: "崇基学院餐厅",
    type: "canteen",
    description: null,
    rating: 3.8,
    reviewCount: 187,
    recommendedDishes: ["麻婆豆腐饭", "海南鸡饭"],
    dishCount: 11,
  },
  {
    slug: "new-asia",
    name: "新亚书院餐厅",
    type: "canteen",
    description: null,
    rating: 3.6,
    reviewCount: 154,
    recommendedDishes: ["泰式炒河粉"],
    dishCount: 8,
  },
  {
    slug: "united-college",
    name: "联合书院餐厅",
    type: "canteen",
    description: null,
    rating: 3.5,
    reviewCount: 132,
    recommendedDishes: ["鲜虾云吞面"],
    dishCount: 10,
  },
  {
    slug: "shaw-college-2",
    name: "逸夫书院餐厅",
    type: "canteen",
    description: null,
    rating: 3.3,
    reviewCount: 118,
    recommendedDishes: ["叉烧饭"],
    dishCount: 7,
  },
  {
    slug: "morning-side",
    name: "晨兴书院餐厅",
    type: "canteen",
    description: null,
    rating: 3.2,
    reviewCount: 97,
    recommendedDishes: [],
    dishCount: 6,
  },
  {
    slug: "ching-man",
    name: "敬文书院餐厅",
    type: "canteen",
    description: null,
    rating: 3.1,
    reviewCount: 85,
    recommendedDishes: [],
    dishCount: 8,
  },
  {
    slug: "university-canteen",
    name: "大学餐厅",
    type: "canteen",
    description: null,
    rating: 3.0,
    reviewCount: 72,
    recommendedDishes: [],
    dishCount: 9,
  },
];

// ==========================================================================
// Delivery Merchants
// ==========================================================================
export const deliveryMerchants: Venue[] = [
  {
    slug: "mcdonalds",
    name: "麦当劳",
    type: "delivery",
    description: null,
    rating: 4.1,
    reviewCount: 472,
    recommendedDishes: ["麦辣鸡腿堡套餐", "巨无霸套餐", "麦乐鸡"],
    dishCount: 18,
    tags: ["🛵 外卖配送", "⚡ 约 30 分钟"],
  },
  {
    slug: "kfc",
    name: "肯德基",
    type: "delivery",
    description: null,
    rating: 3.9,
    reviewCount: 389,
    recommendedDishes: ["香辣鸡腿堡", "葡式蛋挞"],
    dishCount: 15,
    tags: ["🛵 外卖配送", "⚡ 约 30 分钟"],
  },
  {
    slug: "pizza-hut",
    name: "必胜客",
    type: "delivery",
    description: null,
    rating: 4.0,
    reviewCount: 312,
    recommendedDishes: ["夏威夷披萨", "忌廉汤"],
    dishCount: 14,
    tags: ["🛵 外卖配送", "⚡ 约 40 分钟"],
  },
  {
    slug: "yoshinoya",
    name: "吉野家",
    type: "delivery",
    description: null,
    rating: 3.8,
    reviewCount: 276,
    recommendedDishes: ["牛肉饭", "照烧鸡饭"],
    dishCount: 12,
    tags: ["🛵 外卖配送", "⚡ 约 25 分钟"],
  },
  {
    slug: "cafe-de-coral",
    name: "大家乐",
    type: "delivery",
    description: null,
    rating: 3.7,
    reviewCount: 445,
    recommendedDishes: ["焗猪扒饭", "叉烧煎蛋饭"],
    dishCount: 16,
    tags: ["🛵 外卖配送", "⚡ 约 35 分钟"],
  },
  {
    slug: "fairwood",
    name: "大快活",
    type: "delivery",
    description: null,
    rating: 3.6,
    reviewCount: 298,
    recommendedDishes: ["咖喱牛腩饭"],
    dishCount: 13,
    tags: ["🛵 外卖配送", "⚡ 约 30 分钟"],
  },
  {
    slug: "tam-jai",
    name: "谭仔米线",
    type: "delivery",
    description: null,
    rating: 4.3,
    reviewCount: 521,
    recommendedDishes: ["麻辣米线", "酸辣米线", "蒜泥白肉"],
    dishCount: 11,
    tags: ["🛵 外卖配送", "⚡ 约 25 分钟"],
  },
  {
    slug: "genki-sushi",
    name: "元气寿司",
    type: "delivery",
    description: null,
    rating: 4.2,
    reviewCount: 367,
    recommendedDishes: ["三文鱼寿司", "鳗鱼寿司"],
    dishCount: 10,
    tags: ["🛵 外卖配送", "⚡ 约 40 分钟"],
  },
];

// ==========================================================================
// Dishes for 善衡书院 (default canteen shown)
// ==========================================================================
export const shawDishes: Dish[] = [
  {
    slug: "char-siu-rice",
    name: "叉烧饭",
    venueSlug: "shaw",
    price: 32,
    rating: 4.2,
    reviewCount: 89,
    description: "经典港式叉烧，选用上等梅头肉，以秘制叉烧酱腌制后慢火烤制。色泽红润，外焦里嫩，配以香软白饭，是不可错过的食堂招牌。",
    imageSeed: "char-siu-rice",
    ratingDistribution: [58, 28, 10, 3, 1],
    likeCount: 98,
    dislikeCount: 7,
  },
  {
    slug: "curry-chicken",
    name: "咖喱鸡饭",
    venueSlug: "shaw",
    price: 35,
    rating: 4.0,
    reviewCount: 72,
    description: null,
    imageSeed: "curry-chicken",
    ratingDistribution: [48, 32, 14, 4, 2],
    likeCount: 85,
    dislikeCount: 9,
  },
  {
    slug: "beef-noodle-soup",
    name: "红烧牛肉面",
    venueSlug: "shaw",
    price: 42,
    rating: 4.8,
    reviewCount: 156,
    description: "经典红烧牛肉面，选用上等牛腩慢炖数小时，汤头浓郁鲜美。配以手工拉面，面条劲道爽滑。加入时令蔬菜，一碗下肚暖胃又满足。每日限量供应，是善衡书院食堂最受欢迎的招牌菜品之一。",
    imageSeed: "beef-noodle-soup",
    ratingDistribution: [82, 12, 4, 1, 1],
    likeCount: 128,
    dislikeCount: 3,
  },
  {
    slug: "roast-duo",
    name: "烧味双拼",
    venueSlug: "shaw",
    price: 45,
    rating: 4.3,
    reviewCount: 64,
    description: null,
    imageSeed: "roast-duo",
    ratingDistribution: [62, 24, 10, 3, 1],
    likeCount: 112,
    dislikeCount: 8,
  },
  {
    slug: "tomato-egg",
    name: "番茄炒蛋饭",
    venueSlug: "shaw",
    price: 28,
    rating: 3.5,
    reviewCount: 43,
    description: null,
    imageSeed: "tomato-egg",
    ratingDistribution: [22, 38, 24, 10, 6],
    likeCount: 56,
    dislikeCount: 18,
  },
  {
    slug: "mapo-tofu",
    name: "麻婆豆腐饭",
    venueSlug: "shaw",
    price: 30,
    rating: 4.1,
    reviewCount: 58,
    description: "四川风味麻婆豆腐，麻辣鲜香。豆腐嫩滑，肉末酥香，花椒的麻与辣椒的辣完美平衡。",
    imageSeed: "mapo-tofu",
    ratingDistribution: [54, 26, 14, 4, 2],
    likeCount: 91,
    dislikeCount: 10,
  },
  {
    slug: "pad-thai",
    name: "泰式炒河粉",
    venueSlug: "shaw",
    price: 38,
    rating: 3.8,
    reviewCount: 37,
    description: null,
    imageSeed: "pad-thai",
    ratingDistribution: [36, 32, 20, 8, 4],
    likeCount: 73,
    dislikeCount: 15,
  },
  {
    slug: "iced-lemon-tea",
    name: "冻柠茶",
    venueSlug: "shaw",
    price: 12,
    rating: 4.0,
    reviewCount: 91,
    description: null,
    imageSeed: "iced-lemon-tea",
    ratingDistribution: [46, 30, 16, 5, 3],
    likeCount: 88,
    dislikeCount: 6,
  },
  {
    slug: "shrimp-wonton",
    name: "鲜虾云吞面",
    venueSlug: "shaw",
    price: 36,
    rating: 4.6,
    reviewCount: 112,
    description: "港式经典云吞面，每颗云吞包裹整只鲜虾。汤底以大地鱼熬制，清鲜不腻。面条弹牙爽口。",
    imageSeed: "shrimp-wonton",
    ratingDistribution: [74, 16, 7, 2, 1],
    likeCount: 118,
    dislikeCount: 4,
  },
  {
    slug: "hainanese-chicken",
    name: "海南鸡饭",
    venueSlug: "shaw",
    price: 40,
    rating: 4.4,
    reviewCount: 78,
    description: null,
    imageSeed: "hainanese-chicken",
    ratingDistribution: [64, 22, 10, 3, 1],
    likeCount: 106,
    dislikeCount: 5,
  },
  {
    slug: "yangzhou-fried-rice",
    name: "扬州炒饭",
    venueSlug: "shaw",
    price: 33,
    rating: 3.7,
    reviewCount: 45,
    description: null,
    imageSeed: "fried-rice-yangzhou",
    ratingDistribution: [30, 34, 22, 9, 5],
    likeCount: 64,
    dislikeCount: 19,
  },
];

// ==========================================================================
// Dishes for 麦当劳 (default delivery merchant shown)
// ==========================================================================
export const mcdonaldsDishes: Dish[] = [
  {
    slug: "big-mac-meal",
    name: "巨无霸套餐",
    venueSlug: "mcdonalds",
    price: 42,
    rating: 4.3,
    reviewCount: 215,
    description: "经典巨无霸汉堡配薯条和汽水。双层牛肉饼，特制酱料，生菜芝士，芝麻面包。",
    imageSeed: "big-mac-meal",
    ratingDistribution: [60, 24, 12, 3, 1],
    likeCount: 178,
    dislikeCount: 12,
  },
  {
    slug: "spicy-chicken-burger",
    name: "麦辣鸡腿堡套餐",
    venueSlug: "mcdonalds",
    price: 38,
    rating: 4.6,
    reviewCount: 198,
    description: null,
    imageSeed: "spicy-chicken-burger",
    ratingDistribution: [76, 16, 5, 2, 1],
    likeCount: 165,
    dislikeCount: 8,
  },
  {
    slug: "mcnuggets-9",
    name: "麦乐鸡（9件）",
    venueSlug: "mcdonalds",
    price: 25,
    rating: 4.0,
    reviewCount: 167,
    description: null,
    imageSeed: "mcnuggets-9",
    ratingDistribution: [44, 32, 16, 5, 3],
    likeCount: 142,
    dislikeCount: 14,
  },
  {
    slug: "strawberry-shake",
    name: "士多啤梨奶昔",
    venueSlug: "mcdonalds",
    price: 18,
    rating: 4.1,
    reviewCount: 142,
    description: null,
    imageSeed: "strawberry-shake",
    ratingDistribution: [48, 30, 14, 5, 3],
    likeCount: 120,
    dislikeCount: 11,
  },
  {
    slug: "sundae-chocolate",
    name: "新地（朱古力）",
    venueSlug: "mcdonalds",
    price: 12,
    rating: 3.7,
    reviewCount: 98,
    description: null,
    imageSeed: "sundae-chocolate",
    ratingDistribution: [30, 34, 22, 9, 5],
    likeCount: 78,
    dislikeCount: 20,
  },
  {
    slug: "hotcake-breakfast",
    name: "热香饼早餐",
    venueSlug: "mcdonalds",
    price: 30,
    rating: 4.2,
    reviewCount: 134,
    description: null,
    imageSeed: "hotcake-breakfast",
    ratingDistribution: [56, 26, 12, 4, 2],
    likeCount: 110,
    dislikeCount: 9,
  },
  {
    slug: "iced-latte-mcd",
    name: "冰拿铁",
    venueSlug: "mcdonalds",
    price: 20,
    rating: 3.5,
    reviewCount: 76,
    description: null,
    imageSeed: "iced-latte-mcd",
    ratingDistribution: [24, 36, 24, 10, 6],
    likeCount: 58,
    dislikeCount: 22,
  },
  {
    slug: "chicken-wrap",
    name: "鸡肉卷",
    venueSlug: "mcdonalds",
    price: 22,
    rating: 3.9,
    reviewCount: 88,
    description: null,
    imageSeed: "chicken-wrap",
    ratingDistribution: [40, 30, 18, 8, 4],
    likeCount: 70,
    dislikeCount: 15,
  },
  {
    slug: "double-cheeseburger",
    name: "双层芝士汉堡",
    venueSlug: "mcdonalds",
    price: 35,
    rating: 4.4,
    reviewCount: 156,
    description: null,
    imageSeed: "double-cheeseburger",
    ratingDistribution: [64, 22, 10, 3, 1],
    likeCount: 132,
    dislikeCount: 8,
  },
  {
    slug: "fries-large",
    name: "大薯条",
    venueSlug: "mcdonalds",
    price: 14,
    rating: 4.0,
    reviewCount: 203,
    description: null,
    imageSeed: "fries-large",
    ratingDistribution: [46, 30, 16, 5, 3],
    likeCount: 175,
    dislikeCount: 10,
  },
  {
    slug: "filet-o-fish",
    name: "麦香鱼套餐",
    venueSlug: "mcdonalds",
    price: 36,
    rating: 3.6,
    reviewCount: 92,
    description: null,
    imageSeed: "filet-o-fish",
    ratingDistribution: [28, 32, 24, 10, 6],
    likeCount: 65,
    dislikeCount: 24,
  },
];

// ==========================================================================
// Reviews (shared across dishes)
// ==========================================================================
export const beefNoodleReviews: Review[] = [
  {
    author: "Kevin Li",
    initial: "K",
    date: "2024-11-15",
    rating: 5,
    text: "牛肉炖得非常软烂，汤头浓郁鲜美，面条劲道恰到好处。每周必吃一次的招牌菜，强烈推荐！",
  },
  {
    author: "Sarah Chan",
    initial: "S",
    date: "2024-11-10",
    rating: 4,
    text: "味道不错但份量偏少，男生可能不太够吃。建议加底加面。汤是精华，每次都会喝光。",
  },
  {
    author: "Jason Wong",
    initial: "J",
    date: "2024-11-05",
    rating: 5,
    text: "绝对的中大第一牛肉面！在港读书三年吃过最好的食堂出品。红烧汁有家的味道，每次想家的时候都会来这里。",
  },
  {
    author: "Amy Cheung",
    initial: "A",
    date: "2024-10-28",
    rating: 4,
    text: "牛肉面爱好者狂喜！汤底据说是熬了好几个小时的，确实很鲜。不过排队时间有点长，建议避开高峰期。",
  },
];

// ==========================================================================
// Mock reviews (ported from canteen-prototypes/canteen-menu.html)
// ==========================================================================
export const dishReviews: Record<string, DishReview[]> = {
  "char-siu-rice": [
    { type: "like", author: "美食猎人", text: "叉烧肥瘦相间，蜜汁入味十足，每次来善衡都必点！" },
    { type: "like", author: "港式茶记", text: "正宗港式叉烧风味，饭量也很足，HKD 32 性价比高。" },
    { type: "dislike", author: "挑剔食客", text: "有时叉烧偏干偏柴，出品不太稳定，整体还行。" },
  ],
  "curry-chicken": [
    { type: "like", author: "咖喱控", text: "咖喱浓郁椰香十足，鸡肉嫩滑，配饭一流！" },
    { type: "like", author: "美食猎人", text: "咖喱饭也相当不错，想不到善衡还有这手！" },
    { type: "dislike", author: "清淡派", text: "略嫌油腻，吃完有点腻。口味偏重，份量一般。" },
  ],
  "beef-noodle-soup": [
    { type: "like", author: "牛肉面死忠", text: "牛肉炖得软烂入味，汤头浓郁！中大第一牛肉面当之无愧。" },
    { type: "like", author: "美食猎人", text: "手工面条劲道爽滑，红烧汁有家的味道，每周必吃。" },
    { type: "like", author: "新同学", text: "来港读书第一碗惊艳到我的面，强烈推荐给所有新生！" },
    { type: "dislike", author: "急性子食客", text: "排队实在太久了…味道好但时间成本太高。" },
  ],
  "roast-duo": [
    { type: "like", author: "烧味专家", text: "双拼份量很足，烧鸭皮脆肉嫩，叉烧蜜汁香甜。" },
    { type: "like", author: "美食猎人", text: "HKD 45 这个份量在香港算良心了，肉比饭多！" },
  ],
  "tomato-egg": [
    { type: "like", author: "家常味道", text: "番茄炒蛋酸甜适中，简单却美味，很有家的感觉。" },
    { type: "dislike", author: "重口味星人", text: "味道清淡，适合口味不重的人。我觉得有点太素了。" },
    { type: "dislike", author: "挑剔食客", text: "番茄太酸了，蛋又不够滑。可能是我运气不好。" },
  ],
  "mapo-tofu": [
    { type: "like", author: "川味爱好者", text: "麻辣够味，豆腐嫩滑，在港难得吃到正宗麻婆豆腐！" },
    { type: "like", author: "日常食客", text: "HKD 30 就能吃到饱，性价比无敌，日常之选。" },
    { type: "like", author: "美食猎人", text: "麻婆豆腐饭辣度刚好，每次都吃得很过瘾！" },
  ],
  "pad-thai": [
    { type: "like", author: "东南亚胃", text: "pad thai 味道很正宗！酸辣开胃，河粉炒得刚刚好。" },
    { type: "dislike", author: "传统口味", text: "不太习惯泰式口味，偏甜。但朋友都说好吃。" },
  ],
  "iced-lemon-tea": [
    { type: "like", author: "冻柠茶达人", text: "茶味浓郁柠檬新鲜，HKD 12 超值！解暑必备。" },
    { type: "like", author: "美食猎人", text: "冻柠茶配叉烧饭是绝配！每次来都这么吃。" },
  ],
  "shrimp-wonton": [],
  "hainanese-chicken": [
    { type: "like", author: "海南鸡饭专家", text: "鸡皮爽滑鸡肉鲜嫩，油饭香而不腻，酱料很地道。" },
    { type: "like", author: "南洋胃", text: "酱料是灵魂！三种酱都很正，HKD 40 值得。" },
    { type: "dislike", author: "大胃王", text: "份量偏少，男生不太够吃。建议外卖加底。" },
  ],
  "yangzhou-fried-rice": [
    { type: "like", author: "炒饭达人", text: "粒粒分明，镬气十足！扬州炒饭就该是这个味道。" },
    { type: "like", author: "日常食客", text: "HKD 33 管饱，简单实在，不知道吃什么时候的首选。" },
  ],
  "big-mac-meal": [
    { type: "like", author: "汉堡控", text: "巨无霸经典永不过时，双层牛肉饼超满足！" },
    { type: "like", author: "快餐达人", text: "酱料是灵魂，每次吃都有满满的幸福感。" },
  ],
  "spicy-chicken-burger": [
    { type: "like", author: "辣味控", text: "麦辣鸡腿堡辣得刚好，每次外卖必点！" },
    { type: "like", author: "港味猎人", text: "鸡肉外酥里嫩，HKD 38 性价比高。" },
    { type: "dislike", author: "清淡党", text: "太辣了，不太适合不能吃辣的人。" },
  ],
  "mcnuggets-9": [
    { type: "like", author: "炸鸡迷", text: "麦乐鸡蘸甜酸酱，神仙搭配！每次都点9件装。" },
    { type: "dislike", author: "健康控", text: "炸鸡虽然好吃但太油腻了，偶尔吃一次还行。" },
  ],
};

// ==========================================================================
// Helper: get venue by slug
// ==========================================================================
export function getVenueBySlug(slug: string): Venue | undefined {
  return [...canteens, ...deliveryMerchants].find((v) => v.slug === slug);
}

// ==========================================================================
// Helper: get dishes for a venue
// ==========================================================================
export function getDishesForVenue(venueSlug: string): Dish[] {
  if (venueSlug === "shaw") return shawDishes;
  if (venueSlug === "mcdonalds") return mcdonaldsDishes;
  // Fallback: return shaw dishes for any other canteen
  return shawDishes;
}

// ==========================================================================
// Helper: get a dish by slug
// ==========================================================================
export function getDishBySlug(slug: string): Dish | undefined {
  const allDishes = [...shawDishes, ...mcdonaldsDishes];
  return allDishes.find((d) => d.slug === slug);
}

// ==========================================================================
// Helper: get reviews for a dish
// ==========================================================================
export function getReviewsForDish(_dishSlug: string): Review[] {
  // For prototype, all dishes share the same reviews
  return beefNoodleReviews;
}

// ==========================================================================
// All venues combined (sorted by rating desc, for leaderboard)
// ==========================================================================
export const allVenuesByRating: Venue[] = [...canteens, ...deliveryMerchants]
  .sort((a, b) => b.rating - a.rating);
