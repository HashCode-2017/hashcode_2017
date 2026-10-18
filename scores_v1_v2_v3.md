# 04 · How the solver evolved: V1 → V2 → V3

## +2,079,541 points (+11.74%) from V1 to V3, same input, same machine

Group D, run on the 24 instances in `in_new/` (sorted from the smallest file to the largest).

| | **V1 · baseline** | **V2 · eviction** | **V3 · heap + swap** |
|---|--:|--:|--:|
| Fill order | cache by cache (index order) | cache by cache | global max-heap |
| Clean-up | — | evict dominated | evict + swap |
| 2_2_2_1 | 47,672 | 47,672 (+0.00%) | 951,327 (+1895.57%) |
| 4_2_4_2 | 344,442 | 344,442 (+0.00%) | 655,321 (+90.26%) |
| 6_2_6_2 | 499,524 | 499,524 (+0.00%) | 499,524 (+0.00%) |
| 8_2_8_2 | 432,762 | 432,762 (+0.00%) | 567,228 (+31.07%) |
| 20_2_20_2 | 475,171 | 475,171 (+0.00%) | 524,928 (+10.47%) |
| zipF_instance | 1,883,765 | 1,897,350 (+0.72%) | 1,915,779 (+0.97%) |
| regional_instance | 2,321,415 | 2,369,706 (+2.08%) | 2,367,395 (-0.10%) |
| supra | 369,631 | 369,631 (+0.00%) | 411,743 (+11.39%) |
| big | 249,794 | 249,794 (+0.00%) | 271,267 (+8.60%) |
| INSTANCED | 1,256,470 | 1,256,470 (+0.00%) | 1,277,284 (+1.66%) |
| medium_skew_sparse_lambda | 41,416 | 41,504 (+0.21%) | 43,283 (+4.29%) |
| 4990_246_84901_50 | 1,705,046 | 1,705,904 (+0.05%) | 1,799,210 (+5.47%) |
| 3860_246_84901_66 | 1,969,077 | 1,972,878 (+0.19%) | 1,977,797 (+0.25%) |
| 6970_311_100000_69 | 1,765,952 | 1,775,806 (+0.56%) | 1,837,888 (+3.50%) |
| dense2 | 32,814 | 33,144 (+1.01%) | 284,493 (+758.35%) |
| dense | 63,868 | 63,969 (+0.16%) | 69,654 (+8.89%) |
| medium_mixed_lambda | 49,207 | 49,207 (+0.00%) | 51,168 (+3.99%) |
| 10000_500_100000_100 | 2,006,044 | 2,014,142 (+0.40%) | 2,020,907 (+0.34%) |
| medium_flat_sparse_lambda | 22,901 | 22,901 (+0.00%) | 23,597 (+3.04%) |
| realistic_large_clustered | 925,408 | 935,625 (+1.10%) | 947,788 (+1.30%) |
| realistic_large_random | 907,070 | 910,627 (+0.39%) | 928,932 (+2.01%) |
| INSATANC2D | 120,346 | 125,121 (+3.97%) | 131,647 (+5.22%) |
| medium_skew_dense_dejavu | 137,816 | 137,816 (+0.00%) | 146,067 (+5.99%) |
| medium_flat_dense_dejavu | 86,370 | 86,370 (+0.00%) | 89,295 (+3.39%) |
| **Total** | **17,713,981** | **17,817,536** (+0.58%) | **19,793,522** (+11.09%) |
| Runtime on realistic_large_random | ~11 s | ~28 s | ~192 s |

Percentages in the V2 and V3 columns compare each version with the one before it (V2 with V1, V3 with V2).

**In plain words:** each version kept the previous ideas and added one fix. On our slowest instance, V3 is about 17× slower than V1, for +2.41% more score.

Commands: V1 = `--strategy per-cache --no-swap --no-evict`, V2 = `--strategy per-cache --no-swap`, V3 = default. Run them on the instances to regenerate the outputs.

### Total score · axis starts at 17.51 M

```
best per instance (VBS)    20,568,196  ----------------------------------------
V1 baseline                17,713,981  ███
V2 + eviction              17,817,536  ████
V3 + heap & swap           19,793,522  ██████████████████████████████
```

VBS = the best score per instance across all groups in the class sheet (taking our V3 where it is higher).

### V3 gain over V1, per instance

```
2_2_2_1                     ██████████████████████████████▶ +1895.57%
dense2                      ██████████████████████████████▶  +766.99%
4_2_4_2                     ██████████████████████████████▶   +90.26%
8_2_8_2                     ██████████████████████████████▶   +31.07%
supra                       ████████████████████████████      +11.39%
20_2_20_2                   ██████████████████████████        +10.47%
INSATANC2D                  ███████████████████████            +9.39%
dense                       ███████████████████████            +9.06%
big                         █████████████████████              +8.60%
medium_skew_dense_dejavu    ███████████████                    +5.99%
4990_246_84901_50           ██████████████                     +5.52%
medium_skew_sparse_lambda   ███████████                        +4.51%
6970_311_100000_69          ██████████                         +4.07%
medium_mixed_lambda         ██████████                         +3.99%
medium_flat_dense_dejavu    ████████                           +3.39%
medium_flat_sparse_lambda   ████████                           +3.04%
realistic_large_clustered   ██████                             +2.42%
realistic_large_random      ██████                             +2.41%
regional_instance           █████                              +1.98%
zipF_instance               ████                               +1.70%
INSTANCED                   ████                               +1.66%
10000_500_100000_100        ██                                 +0.74%
3860_246_84901_66           █                                  +0.44%
6_2_6_2                     |                                  +0.00%
```

Bars are capped at +12% (▶ marks a bar that goes past the cap).
