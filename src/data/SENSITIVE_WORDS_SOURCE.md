# Sensitive word lexicon

Vendored from [konsheng/Sensitive-lexicon](https://github.com/konsheng/Sensitive-lexicon) (MIT).

| File | Upstream |
|------|----------|
| `sensitive-words-netease.txt` | Vocabulary/网易前端过滤敏感词库.txt |
| `sensitive-words-porn.txt` | Vocabulary/色情词库.txt |
| `sensitive-words-violence.txt` | Vocabulary/暴恐词库.txt |
| `sensitive-words-guns.txt` | Vocabulary/涉枪涉爆.txt |

Matcher at runtime: [`mint-filter`](https://github.com/ZhelinCheng/mint-filter) (Aho–Corasick).

Ads / short spam terms (e.g. `QQ`, `网络`) are intentionally omitted to limit false positives on campus UGC.
