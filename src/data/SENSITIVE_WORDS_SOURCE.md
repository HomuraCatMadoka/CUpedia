# Sensitive word lexicon

Vendored from [konsheng/Sensitive-lexicon](https://github.com/konsheng/Sensitive-lexicon) (MIT).

| File | Upstream |
|------|----------|
| `sensitive-words-politics.txt` | 政治类型 + 反动词库 + 贪腐词库，并并入网易前端词库中与 GFW/补充/民生等涉政词库相交的条目 |
| `sensitive-words-porn.txt` | Vocabulary/色情词库.txt |
| `sensitive-words-violence.txt` | Vocabulary/暴恐词库.txt |
| `sensitive-words-guns.txt` | Vocabulary/涉枪涉爆.txt |
| `sensitive-words-urls.txt` | Vocabulary/非法网址.txt |

Matcher at runtime: [`mint-filter`](https://github.com/ZhelinCheng/mint-filter) (Aho–Corasick).

Publish gate: `assertNoSensitiveContent` only runs when `SENSITIVE_CONTENT_FILTER` is on (default). Set to `false` / `0` / `off` / `no` to skip checks on comment and danmaku publish.

URL list entries are normalized to hostname (path/port stripped) on load. Overly broad politics terms and `a.com` were removed to limit substring false positives.

The full NetEase frontend lexicon is **not** loaded — it false-positives on ordinary campus terms (e.g. `考试`, `24`). Political coverage is kept via the dedicated politics lists plus the NetEase ∩ politics-seed subset above.
