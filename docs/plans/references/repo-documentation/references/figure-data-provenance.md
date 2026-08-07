# Figure-data provenance: poster "Missed fraction of GT elements" histogram

Session 2026-08: user asked where the poster's missed-fraction histogram data
came from ("poster Missed fraction of GT elements # of screenshots 这个图的数据是哪来的").

## What the poster contains

`poster/poster.tex` (block 2, End-to-end setting) — the histogram is
hardcoded, no generating script or intermediate JSON was ever committed:

```latex
\foreach \i/\c/\t in {1/4/30, 2/12/45, 3/36/60, 4/54/75, 5/94/90} {
  \fill[cuhk-purple!\t] ...  % bars 4, 12, 36, 54, 94 (sum = 200)
}
```

Comment in the source: "Fraction of GT elements missed by the VLM, per
screenshot (200 RICO)". x labels 0.1/0.3/0.5/0.7/0.9, y = \# of screenshots.

## The authoritative per-image data

`experiments/vlm_completion/pipeline_per_image.json` — dict with `before`
and `after` lists, each **200 images** with `image_id, tp, fp, fn,
precision, recall, f1, n_pred, n_gt` (after adds `n_proposals`).

Aggregation check (do this FIRST — it confirms the JSON is the source the
report numbers came from):

| sum over `before` | value | report says |
|---|---|---|
| n_gt | 4789 | 4789 ✓ |
| n_pred | 2947 | 2947 ✓ |
| fn | 3663 | 3663 ✓ |
| tp | 1126 | 1126 ✓ |
| fp | 1821 | 1821 ✓ |

## Recomputing the histogram

missed fraction per image = `fn / n_gt` (center-distance 0.1 matching
definition), bucketed [0,0.2),[0.2,0.4),[0.4,0.6),[0.6,0.8),[0.8,1.0]:

    recomputed ≈ [5, 12, 35, 57, 91]   (border handling shifts a few)
    poster       [4, 12, 36, 54, 94]

Front two buckets match exactly; the last three differ by 1–3 images. No
bucket-edge combination reproduced the poster values exactly. Conclusion:
the poster numbers likely came from an earlier run of the eval script with a
slightly different threshold/border/checkpoint; the exact generating run is
not preserved in the repo.

## RESOLUTION (same session, user approved regeneration)

User approved replacing the hardcoded data with reproducible counts. New
values computed from `pipeline_per_image.json` (`before`, fn/n_gt,
left-closed-right-open buckets [0,0.2),[0.2,0.4),[0.4,0.6),[0.6,0.8),[0.8,1.0],
mf < edge assigns left bucket, mf==1.0 falls in the last):

    [4, 12, 31, 59, 94]   (sum = 200; buckets 3 and 4 corrected from 36/54)

Poster edit: `\foreach \i/\c/\t in {1/4/30,2/12/45,3/31/60,4/59/75,5/94/90}`
and the source comment now cites the JSON + matching 口径. Bar heights use
the same `\sc` so the tallest bar (94) is unchanged; no axis rescale needed.
Compile poster (lualatex) and verify exit 0.

## Verifying OTHER poster figures the same way (reverse-engineer scale factors)

Two more poster figures were provenance-checked in the same session — the
technique generalizes:

1. **Constraint-count bars** (All 10 types 37.3 / Remove GRID 37.2 / Remove
   SPACING 30.9 / Remove CONTAINMENT 28.7 / Only ALIGNMENT 22.4 / Remove all
   ALIGNMENT 15.1): verified EXACTLY against `experiments/ablation_results.json`
   (config `{n:500, drop_ratio:0.6}`, field `avg_constraints_per_graph` per
   group). All six values matched — this figure had a real source.
2. **Constraints-vs-violated scatter** (32 points, r = 0.96, OLS
   y = 0.83x − 1.49, r² = 0.92): the dots are hardcoded as
   `\node[circle,...] at ({x*0.14},{y*0.16}) {};` — the per-axis scale
   factors (0.14, 0.16) REVERSE to the raw (x, y) = (n_constraints,
   n_violated) pairs. Compare the recovered pairs (sorted) against
   `per_image_results.json` fields `n_constraints`/`n_violated` (exactly 32
   images): 0 mismatches. Recompute Pearson r from the JSON:
   r = 0.9604 ≈ the poster's 0.96 label. Confirmed real source.

Reverse-engineering rule: when a TikZ scatter/histogram hardcodes
coordinates with per-axis scale factors (`{x*sx},{y*sy}`), divide each
coordinate by its factor to recover the raw data, sort, and diff against the
candidate JSON's per-image fields. Exact match + recomputed r/buckets = real
source; mismatch = generating run lost, say so and offer regeneration.

## The two measurement 口径 (important — same data, different claims)

- **Not-detected rate** (what the abstract's "miss 38%" means):
  1 − 2947/4789 = 0.385 — the VLM reports 2947 elements, i.e. 61.5% of the
  4789 GT elements.
- **Matching-failure rate** (what the poster histogram shows):
  Σfn/Σn_gt = 3663/4789 = 0.765 — even detected elements count as missed
  when their box center is > 0.1 away from the GT box. This is why the
  histogram is right-skewed (94 of 200 screenshots in the 0.8–1.0 bucket).

The abstract's 38% and the histogram's ~76% average are NOT contradictory;
they answer different questions. State which one a figure uses.

## Gotchas

- `experiments/vlm_completion/per_image_results.json` has only 32 images
  (early `evaluate_vlm_completion` run, 32/193 valid graphs) — do not
  mistake it for the 200-image source. Check `len(list)` before trusting.
- `recheck_best_model.json` per_image has before_tp/after_tp only, no fn —
  can't rebuild the histogram from it.
- `experiments/results.json` is the early hyper-parameter sweep (6 configs,
  n_samples 200 each) — unrelated to the missed-fraction distribution.
