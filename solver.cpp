// Hash Code 2017 Qualification Round -- "Streaming Videos", C++ port.
//
// Same algorithm as solution.py (global lazy-heap greedy, dead-weight
// eviction, swap pass, up to 5 rounds), plus an exact per-cache re-pack
// (--repack) and a large neighbourhood search (--lns), so the whole
// pipeline runs in one fast binary.
//
// Build:  g++ -O2 -std=c++17 -o solver solver.cpp
// Usage:  solver <input.in> <output.out> [--rounds 5] [--strategy global|per-cache]
//                [--no-evict] [--no-swap] [--repack] [--candidates 400]
//                [--kicks N] [--kick-size 3] [--lns SECONDS] [--lns-size 2]
//                [--seed 1] [--start file.out] [--time-limit SECONDS] [--temp T]
//                [--moves SECONDS]
//
// --time-limit caps the whole run: the first greedy round always completes
// (so there is a valid answer), every later step stops when time is up, and
// the best solution found so far is written.
//
// --start skips the greedy and starts from an existing submission.
// Ties between equal candidates may be broken differently from the Python
// version (set iteration order), so scores can differ very slightly.

#include <bits/stdc++.h>
using namespace std;
typedef long long ll;

// Wall-clock budget for the whole run (--time-limit). Every improvement loop
// checks it between steps, so the run stops on time with a valid solution.
static chrono::steady_clock::time_point g_deadline = chrono::steady_clock::time_point::max();
static bool timeUp() { return chrono::steady_clock::now() >= g_deadline; }
static double secondsLeft() {
    if (g_deadline == chrono::steady_clock::time_point::max()) return 1e18;
    return max(0.0, chrono::duration<double>(g_deadline - chrono::steady_clock::now()).count());
}

struct Inst {
    int V = 0, E = 0, R = 0, C = 0, X = 0;
    vector<int> size, LD;
    vector<vector<pair<int, int>>> epCaches;   // e -> (cache, latency), fastest first
    vector<int> lat;                           // lat[e*C + c], -1 when not connected
    vector<vector<pair<int, int>>> cacheEps;   // c -> (endpoint, latency)
    // Request groups: one per (endpoint, video), requests summed.
    vector<int> rE, rV;
    vector<ll> rN;
    vector<vector<int>> epReq;                 // e -> request groups
    vector<vector<int>> vidReq;                // v -> request groups
    ll totalReq = 0;
    int L(int e, int c) const { return lat[(size_t)e * C + c]; }
};

static vector<char> slurp(const char* path) {
    FILE* f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "cannot open %s\n", path); exit(1); }
    vector<char> buf;
    char tmp[1 << 16];
    size_t n;
    while ((n = fread(tmp, 1, sizeof tmp, f)) > 0) buf.insert(buf.end(), tmp, tmp + n);
    fclose(f);
    buf.push_back(0);
    return buf;
}

struct Reader {
    const char* p;
    ll next() {
        while (*p && (*p < '0' || *p > '9') && *p != '-') ++p;
        bool neg = false;
        if (*p == '-') { neg = true; ++p; }
        ll x = 0;
        while (*p >= '0' && *p <= '9') x = x * 10 + (*p++ - '0');
        return neg ? -x : x;
    }
};

static Inst parse(const char* path) {
    vector<char> buf = slurp(path);
    Reader rd{buf.data()};
    Inst in;
    in.V = rd.next(); in.E = rd.next(); in.R = rd.next(); in.C = rd.next(); in.X = rd.next();
    in.size.resize(in.V);
    for (auto& s : in.size) s = rd.next();
    in.LD.resize(in.E);
    in.epCaches.resize(in.E);
    in.lat.assign((size_t)in.E * in.C, -1);
    in.cacheEps.resize(in.C);
    for (int e = 0; e < in.E; ++e) {
        in.LD[e] = rd.next();
        int K = rd.next();
        for (int k = 0; k < K; ++k) {
            int c = rd.next(), l = rd.next();
            in.epCaches[e].push_back({c, l});
            in.lat[(size_t)e * in.C + c] = l;
            in.cacheEps[c].push_back({e, l});
        }
        stable_sort(in.epCaches[e].begin(), in.epCaches[e].end(),
                    [](auto& a, auto& b) { return a.second < b.second; });
    }
    in.epReq.resize(in.E);
    in.vidReq.resize(in.V);
    unordered_map<ll, int> idx;
    idx.reserve(in.R * 2);
    for (int i = 0; i < in.R; ++i) {
        int v = rd.next(), e = rd.next();
        ll n = rd.next();
        in.totalReq += n;
        ll key = (ll)e * in.V + v;
        auto it = idx.find(key);
        if (it != idx.end()) { in.rN[it->second] += n; continue; }
        int r = in.rE.size();
        idx[key] = r;
        in.rE.push_back(e); in.rV.push_back(v); in.rN.push_back(n);
        in.epReq[e].push_back(r);
    }
    for (int r = 0; r < (int)in.rE.size(); ++r) in.vidReq[in.rV[r]].push_back(r);
    return in;
}

// ---------------------------------------------------------------- placement

struct Placement {
    const Inst* in;
    vector<char> P;                 // P[c*V + v]
    vector<vector<int>> list;       // videos per cache (unordered)
    vector<int> pos;                // index of v inside list[c], for O(1) removal
    vector<int> rem;                // free MB per cache
    explicit Placement(const Inst& I) : in(&I), P((size_t)I.C * I.V, 0), list(I.C),
                                        pos((size_t)I.C * I.V, -1), rem(I.C, I.X) {}
    bool has(int c, int v) const { return P[(size_t)c * in->V + v]; }
    void add(int c, int v) {
        size_t k = (size_t)c * in->V + v;
        if (P[k]) return;
        P[k] = 1; pos[k] = list[c].size(); list[c].push_back(v); rem[c] -= in->size[v];
    }
    void del(int c, int v) {
        size_t k = (size_t)c * in->V + v;
        if (!P[k]) return;
        P[k] = 0;
        int i = pos[k], last = list[c].back();
        list[c][i] = last; pos[(size_t)c * in->V + last] = i;
        list[c].pop_back(); pos[k] = -1; rem[c] += in->size[v];
    }
    // Fastest latency to (endpoint of r, video of r) over holding caches, excluding `skip`.
    int bestExcept(int r, int skip) const {
        int e = in->rE[r], v = in->rV[r], L = in->LD[e];
        for (auto& [c, l] : in->epCaches[e]) {
            if (l >= L) break;
            if (c != skip && has(c, v)) return l;
        }
        return L;
    }
};

static ll scoreOf(const Inst& in, const Placement& p) {
    ll saved = 0;
    for (int r = 0; r < (int)in.rE.size(); ++r)
        saved += in.rN[r] * (in.LD[in.rE[r]] - p.bestExcept(r, -1));
    return in.totalReq ? saved * 1000 / in.totalReq : 0;
}

static void writeOut(const char* path, const Inst& in, const Placement& p) {
    FILE* f = fopen(path, "wb");
    if (!f) { fprintf(stderr, "cannot write %s\n", path); exit(1); }
    int used = 0;
    for (int c = 0; c < in.C; ++c) used += !p.list[c].empty();
    fprintf(f, "%d\n", used);
    for (int c = 0; c < in.C; ++c) {
        if (p.list[c].empty()) continue;
        vector<int> vs = p.list[c];
        sort(vs.begin(), vs.end());
        fprintf(f, "%d", c);
        for (int v : vs) fprintf(f, " %d", v);
        fprintf(f, "\n");
    }
    fclose(f);
}

static void readOut(const char* path, const Inst& in, Placement& p) {
    vector<char> buf = slurp(path);
    Reader rd{buf.data()};
    // Line-based: first number is the count, then "c v v v" per line.
    const char* s = buf.data();
    int n = strtol(s, (char**)&s, 10);
    for (int i = 0; i < n; ++i) {
        while (*s == '\r' || *s == '\n' || *s == ' ') ++s;
        const char* eol = strchr(s, '\n');
        if (!eol) eol = s + strlen(s);
        char* q;
        int c = strtol(s, &q, 10);
        s = q;
        while (s < eol) {
            while (s < eol && (*s == ' ' || *s == '\r')) ++s;
            if (s >= eol) break;
            int v = strtol(s, &q, 10);
            s = q;
            p.add(c, v);
        }
    }
    (void)rd;
}

// ---------------------------------------------------------------- greedy (port of solution.py)

struct Solver {
    const Inst& in;
    Placement& p;
    vector<int> cur;                // cur[r]: best latency currently reached for request group r
    vector<ll> acc;                 // scratch gains per video
    vector<int> touchOrder;         // first-touch order of the scratch gains
    vector<int> touched;            // 1 + index in touchOrder, 0 when untouched

    Solver(const Inst& I, Placement& P) : in(I), p(P), cur(I.rE.size()), acc(I.V, 0), touched(I.V, 0) {
        for (int r = 0; r < (int)cur.size(); ++r) cur[r] = p.bestExcept(r, -1);
    }

    void bump(int v, ll g) {
        if (!touched[v]) { touched[v] = touchOrder.size() + 1; touchOrder.push_back(v); }
        acc[v] += g;
    }
    void clearScratch() {
        for (int v : touchOrder) { acc[v] = 0; touched[v] = 0; }
        touchOrder.clear();
    }

    ll gainOf(int c, int v) const {
        ll t = 0;
        for (int r : in.vidReq[v]) {
            int l = in.L(in.rE[r], c);
            if (l >= 0 && l < cur[r]) t += in.rN[r] * (cur[r] - l);
        }
        return t;
    }

    int place(int c, int v) {
        p.add(c, v);
        int improved = 0;
        for (int r : in.vidReq[v]) {
            int l = in.L(in.rE[r], c);
            if (l >= 0 && l < cur[r]) { cur[r] = l; ++improved; }
        }
        return improved;
    }

    void unplace(int c, int v) {
        p.del(c, v);
        for (int r : in.vidReq[v]) {
            int l = in.L(in.rE[r], c);
            if (l >= 0 && cur[r] == l) cur[r] = p.bestExcept(r, -1);
        }
    }

    struct HE { double key; int c, v; ll g; };
    struct HCmp {   // max by key, then min (c, v, g) -- Python's min-heap on (-key, c, v, g)
        bool operator()(const HE& a, const HE& b) const {
            if (a.key != b.key) return a.key < b.key;
            if (a.c != b.c) return a.c > b.c;
            if (a.v != b.v) return a.v > b.v;
            return a.g > b.g;
        }
    };

    int globalFill() {
        vector<HE> heap;
        for (int c = 0; c < in.C; ++c) {
            if (p.rem[c] <= 0 || in.cacheEps[c].empty()) continue;
            for (auto& [e, l] : in.cacheEps[c])
                for (int r : in.epReq[e]) {
                    int v = in.rV[r];
                    if (l < cur[r] && !p.has(c, v)) bump(v, in.rN[r] * (cur[r] - l));
                }
            for (int v : touchOrder)
                if (in.size[v] <= p.rem[c]) heap.push_back({(double)acc[v] / in.size[v], c, v, acc[v]});
            clearScratch();
        }
        priority_queue<HE, vector<HE>, HCmp> pq(HCmp(), std::move(heap));
        int placements = 0;
        while (!pq.empty()) {
            HE h = pq.top(); pq.pop();
            int s = in.size[h.v];
            if (s > p.rem[h.c]) continue;
            ll actual = gainOf(h.c, h.v);
            if (actual <= 0) continue;
            if (actual < h.g) { pq.push({(double)actual / s, h.c, h.v, actual}); continue; }
            place(h.c, h.v);
            ++placements;
        }
        return placements;
    }

    int perCacheFill() {
        int placements = 0;
        for (int c = 0; c < in.C; ++c) {
            if (p.rem[c] <= 0 || in.cacheEps[c].empty()) continue;
            for (auto& [e, l] : in.cacheEps[c])
                for (int r : in.epReq[e]) {
                    int v = in.rV[r];
                    if (!p.has(c, v) && l < cur[r]) bump(v, in.rN[r] * (cur[r] - l));
                }
            vector<pair<int, ll>> cand;
            for (int v : touchOrder) cand.push_back({v, acc[v]});
            clearScratch();
            stable_sort(cand.begin(), cand.end(), [&](auto& a, auto& b) {
                return (double)a.second / in.size[a.first] > (double)b.second / in.size[b.first];
            });
            for (auto& [v, g] : cand) {
                if (g <= 0) continue;
                if (in.size[v] <= p.rem[c]) { place(c, v); ++placements; }
            }
        }
        return placements;
    }

    int evictDeadWeight() {
        int evicted = 0;
        for (int c = 0; c < in.C; ++c) {
            vector<int> vs = p.list[c];
            sort(vs.begin(), vs.end());
            for (int v : vs) {
                bool dominated = true;
                for (int r : in.vidReq[v]) {
                    int l = in.L(in.rE[r], c);
                    if (l < 0) continue;
                    if (p.bestExcept(r, c) > l) { dominated = false; break; }
                }
                if (dominated) { p.del(c, v); ++evicted; }   // cur[] unchanged by construction
            }
        }
        return evicted;
    }

    int swapPass() {
        const int SWAP_CANDIDATES = 20, MAX_SWAPS_PER_CACHE = 50;
        vector<ll> value(in.V, 0);
        int swaps = 0;
        for (int c = 0; c < in.C; ++c) {
            if (in.cacheEps[c].empty() || p.list[c].empty()) continue;
            for (int it = 0; it < MAX_SWAPS_PER_CACHE; ++it) {
                vector<int> here = p.list[c];
                for (int v : here) value[v] = 0;
                for (auto& [e, l] : in.cacheEps[c])
                    for (int r : in.epReq[e]) {
                        int v = in.rV[r];
                        if (p.has(c, v)) {
                            int second = p.bestExcept(r, c);
                            if (second > l) value[v] += in.rN[r] * (second - l);
                        } else if (l < cur[r]) {
                            bump(v, in.rN[r] * (cur[r] - l));
                        }
                    }
                if (touchOrder.empty()) { clearScratch(); break; }

                sort(here.begin(), here.end());
                stable_sort(here.begin(), here.end(), [&](int a, int b) {
                    return (double)value[a] / in.size[a] < (double)value[b] / in.size[b];
                });
                vector<int> top = touchOrder;   // first-touch order breaks ties, like heapq.nlargest
                int k = min<int>(SWAP_CANDIDATES, top.size());
                partial_sort(top.begin(), top.begin() + k, top.end(), [&](int a, int b) {
                    if (acc[a] != acc[b]) return acc[a] > acc[b];
                    return touched[a] < touched[b];
                });
                top.resize(k);

                int freeMB = p.rem[c];
                ll bestNet = 0; int bestW = -1; vector<int> bestOut;
                for (int w : top) {
                    ll need = in.size[w] - freeMB, cost = 0;
                    vector<int> out;
                    for (int v : here) {
                        if (need <= 0) break;
                        out.push_back(v); cost += value[v]; need -= in.size[v];
                    }
                    if (need > 0) continue;
                    ll net = acc[w] - cost;
                    if (net > 0 && (bestW < 0 || net > bestNet)) { bestNet = net; bestW = w; bestOut = out; }
                }
                clearScratch();
                if (bestW < 0) break;
                for (int v : bestOut) unplace(c, v);
                place(c, bestW);
                ++swaps;
            }
        }
        return swaps;
    }

    void solve(int rounds, bool global, bool evict, bool swap) {
        for (int round = 0; round < rounds; ++round) {
            if (round > 0 && timeUp()) break;     // round 1 always runs
            int placed = global ? globalFill() : perCacheFill();
            int evicted = evict ? evictDeadWeight() : 0;
            int swapped = swap ? swapPass() : 0;
            fprintf(stderr, "  round %d: %d placed, %d evicted, %d swaps -> %lld\n",
                    round + 1, placed, evicted, swapped, scoreOf(in, p));
            if (!placed && !evicted && !swapped) break;
        }
    }
};

// ---------------------------------------------------------------- exact per-cache re-pack

struct Repacker {
    const Inst& in;
    Placement& p;
    vector<int> b1, b1c, b2;        // per request group: best latency, its cache, second best
    vector<ll> g;                   // scratch: gain per video for the cache being packed
    vector<int> gl;                 // videos with an entry in g

    Repacker(const Inst& I, Placement& P) : in(I), p(P), b1(I.rE.size()), b1c(I.rE.size()),
                                             b2(I.rE.size()), g(I.V, 0) {
        for (int r = 0; r < (int)I.rE.size(); ++r) refresh(r);
    }

    void refresh(int r) {
        int e = in.rE[r], v = in.rV[r], L = in.LD[e];
        int f = -1, fc = -1;
        for (auto& [c, l] : in.epCaches[e]) {
            if (l >= L) break;
            if (!p.has(c, v)) continue;
            if (f < 0) { f = l; fc = c; }
            else { b1[r] = f; b1c[r] = fc; b2[r] = l; return; }
        }
        if (f < 0) { b1[r] = L; b1c[r] = -1; b2[r] = L; }
        else { b1[r] = f; b1c[r] = fc; b2[r] = L; }
    }

    void gains(int c) {
        for (auto& [e, l] : in.cacheEps[c])
            for (int r : in.epReq[e]) {
                int other = b1c[r] == c ? b2[r] : b1[r];
                if (other > l) {
                    int v = in.rV[r];
                    if (!g[v]) gl.push_back(v);
                    g[v] += in.rN[r] * (other - l);
                }
            }
    }
    void clearGains() { for (int v : gl) g[v] = 0; gl.clear(); }

    void setCache(int c, const vector<int>& want) {
        vector<int> changed;
        unordered_set<int> w(want.begin(), want.end());
        for (int v : vector<int>(p.list[c])) if (!w.count(v)) { p.del(c, v); changed.push_back(v); }
        for (int v : want) if (!p.has(c, v)) { p.add(c, v); changed.push_back(v); }
        for (int v : changed)
            for (int r : in.vidReq[v])
                if (in.L(in.rE[r], c) >= 0) refresh(r);
    }

    // 0/1 knapsack over (video, size, value); returns chosen videos and total value.
    static ll knapsack(const vector<tuple<int, int, ll>>& items, int X, vector<int>& chosen) {
        ll total = 0, sum = 0;
        for (auto& [v, w, val] : items) sum += w;
        chosen.clear();
        if (sum <= X) {   // everything fits
            for (auto& [v, w, val] : items) { chosen.push_back(v); total += val; }
            return total;
        }
        int m = items.size();
        // Same answer on sizes and capacity divided by their gcd, with a much smaller table.
        int d = 0;
        for (auto& [v, w, val] : items) if (w <= X) d = __gcd(d, w);
        if (d > 1) {
            vector<tuple<int, int, ll>> scaled;
            for (auto& [v, w, val] : items) if (w <= X) scaled.push_back({v, w / d, val});
            return knapsack(scaled, X / d, chosen);
        }
        size_t words = (X + 1 + 63) / 64;
        vector<uint64_t> keep((size_t)m * words, 0);
        vector<ll> dp(X + 1, 0);
        for (int i = 0; i < m; ++i) {
            auto& [v, w, val] = items[i];
            if (w > X) continue;
            uint64_t* k = &keep[(size_t)i * words];
            for (int cap = X; cap >= w; --cap) {
                ll cand = dp[cap - w] + val;
                if (cand > dp[cap]) { dp[cap] = cand; k[cap >> 6] |= 1ULL << (cap & 63); }
            }
        }
        int cap = X;
        for (int i = m - 1; i >= 0; --i) {
            if (keep[(size_t)i * words + (cap >> 6)] >> (cap & 63) & 1) {
                chosen.push_back(get<0>(items[i]));
                cap -= get<1>(items[i]);
            }
        }
        return dp[X];
    }

    ll repack(int c, int candidates) {
        gains(c);
        ll curVal = 0;
        bool dead = false;
        for (int v : p.list[c]) { curVal += g[v]; if (g[v] <= 0) dead = true; }
        vector<int> pool;
        for (int v : gl) if (g[v] > 0) pool.push_back(v);
        if ((int)pool.size() > candidates) {
            vector<int> byRatio = pool, byValue = pool;
            auto ratio = [&](int a, int b) { return (double)g[a] / in.size[a] > (double)g[b] / in.size[b]; };
            int k1 = candidates, k2 = candidates / 4;
            partial_sort(byRatio.begin(), byRatio.begin() + k1, byRatio.end(), ratio);
            partial_sort(byValue.begin(), byValue.begin() + k2, byValue.end(), [&](int a, int b) { return g[a] > g[b]; });
            unordered_set<int> keep(byRatio.begin(), byRatio.begin() + k1);
            keep.insert(byValue.begin(), byValue.begin() + k2);
            for (int v : p.list[c]) if (g[v] > 0) keep.insert(v);
            pool.assign(keep.begin(), keep.end());
            sort(pool.begin(), pool.end());
        }
        vector<tuple<int, int, ll>> items;
        for (int v : pool) items.push_back({v, in.size[v], g[v]});
        vector<int> chosen;
        ll val = knapsack(items, in.X, chosen);
        ll gained = 0;
        if (val > curVal) { gained = val - curVal; clearGains(); setCache(c, chosen); return gained; }
        if (dead) {
            vector<int> alive;
            for (int v : p.list[c]) if (g[v] > 0) alive.push_back(v);
            clearGains(); setCache(c, alive); return 0;
        }
        clearGains();
        return 0;
    }

    ll sweepUntilStable(int candidates, const vector<int>& order, bool log) {
        ll total = 0;
        for (;;) {
            ll gained = 0;
            for (int c : order) {
                if (timeUp()) return total + gained;
                gained += repack(c, candidates);
            }
            total += gained;
            if (log) fprintf(stderr, "  re-pack sweep +%lld pts -> %lld\n", gained * 1000 / in.totalReq,
                             saved() * 1000 / in.totalReq);
            if (!gained) return total;
        }
    }

    // ------------------------------------------------ single-video moves, exact deltas

    // Saving gained by adding v to c (v not in c).
    ll addGain(int c, int v) const {
        ll t = 0;
        for (int r : in.vidReq[v]) {
            int l = in.L(in.rE[r], c);
            if (l >= 0 && l < b1[r]) t += in.rN[r] * (b1[r] - l);
        }
        return t;
    }
    // Saving lost by removing v from c (v in c).
    ll removeLoss(int c, int v) const {
        ll t = 0;
        for (int r : in.vidReq[v])
            if (b1c[r] == c) t += in.rN[r] * (b2[r] - b1[r]);
        return t;
    }
    void addV(int c, int v) {
        p.add(c, v);
        for (int r : in.vidReq[v]) if (in.L(in.rE[r], c) >= 0) refresh(r);
    }
    void delV(int c, int v) {
        p.del(c, v);
        for (int r : in.vidReq[v]) if (in.L(in.rE[r], c) >= 0) refresh(r);
    }
    ll saved() const {
        ll s = 0;
        for (int r = 0; r < (int)b1.size(); ++r) s += in.rN[r] * (in.LD[in.rE[r]] - b1[r]);
        return s;
    }
};

// ---------------------------------------------------------------- large neighbourhood search

// Destroy: empty k caches that share endpoints (picked by walking cache ->
// endpoint -> cache). Repair: re-pack just those caches exactly until stable,
// everyone else fixed. Keep the result if the saving did not drop, else undo.
// With temp > 0 (score points) a worse result is also kept with probability
// exp(delta / T), T cooling linearly to 0; the best placement seen is restored at the end.
static void lns(Repacker& rp, double seconds, int k, int candidates, mt19937_64& rng, double temp) {
    const Inst& in = rp.in;
    Placement& p = rp.p;
    vector<int> caches;
    for (int c = 0; c < in.C; ++c) if (!in.cacheEps[c].empty()) caches.push_back(c);
    if (caches.empty()) return;
    auto rnd = [&](size_t n) { return (size_t)(rng() % n); };
    vector<char> mark(in.E, 0);

    seconds = min(seconds, secondsLeft());
    auto start = chrono::steady_clock::now();
    long long iters = 0, kept = 0, better = 0;
    // Running total of the saving, kept up to date from the local deltas, so
    // progress can be reported every couple of seconds without a full re-score.
    ll total = rp.saved();
    ll bestTotal = total;
    vector<vector<int>> bestLists;
    if (temp > 0) bestLists = p.list;
    uniform_real_distribution<double> unit(0.0, 1.0);
    double lastReport = -2;
    while (chrono::duration<double>(chrono::steady_clock::now() - start).count() < seconds) {
        double t = chrono::duration<double>(chrono::steady_clock::now() - start).count();
        if (t - lastReport >= 2) {
            fprintf(stderr, "  lns score %lld\n", max(total, bestTotal) * 1000 / in.totalReq);
            lastReport = t;
        }
        ++iters;
        vector<int> group{caches[rnd(caches.size())]};
        for (int tries = 0; (int)group.size() < k && tries < 20 * k; ++tries) {
            int c = group[rnd(group.size())];
            int e = in.cacheEps[c][rnd(in.cacheEps[c].size())].first;
            int c2 = in.epCaches[e][rnd(in.epCaches[e].size())].first;
            if (find(group.begin(), group.end(), c2) == group.end()) group.push_back(c2);
        }
        // Requests whose latency can change: those of endpoints touching the group.
        vector<int> eps;
        for (int c : group)
            for (auto& [e, l] : in.cacheEps[c]) if (!mark[e]) { mark[e] = 1; eps.push_back(e); }
        auto local = [&]() {
            ll s = 0;
            for (int e : eps) for (int r : in.epReq[e]) s += in.rN[r] * (in.LD[e] - rp.b1[r]);
            return s;
        };
        ll before = local();
        vector<vector<int>> old;
        for (int c : group) { old.push_back(p.list[c]); rp.setCache(c, {}); }
        vector<int> order = group;
        shuffle(order.begin(), order.end(), rng);
        rp.sweepUntilStable(candidates, order, false);
        ll after = local();
        bool accept = after >= before;
        if (!accept && temp > 0) {
            double T = temp * (1 - t / seconds);
            double delta = (double)(after - before) * 1000 / in.totalReq;
            accept = T > 0 && unit(rng) < exp(delta / T);
        }
        if (accept) {
            ++kept; better += after > before; total += after - before;
            if (temp > 0 && total > bestTotal) { bestTotal = total; bestLists = p.list; }
        }
        else for (size_t i = 0; i < group.size(); ++i) rp.setCache(group[i], old[i]);
        for (int e : eps) mark[e] = 0;
    }
    if (temp > 0 && bestTotal > total)
        for (int c = 0; c < in.C; ++c) rp.setCache(c, bestLists[c]);
    fprintf(stderr, "  lns: %lld iterations, %lld kept, %lld improving\n", iters, kept, better);
}

// ---------------------------------------------------------------- swap / replace annealing

// Cheap moves with exact deltas, only the requests of the two videos involved
// are touched: swap a (in c1) with b (in c2), or replace a in c by b (a = -1:
// just add b). Partners come from shared endpoints, b from requests seen there.
// Accept if not worse, or with probability exp(delta / T), T cooling linearly
// from temp to 0. The best placement seen is restored at the end.
static void moves(Repacker& rp, double seconds, mt19937_64& rng, double temp) {
    const Inst& in = rp.in;
    Placement& p = rp.p;
    vector<int> caches;
    for (int c = 0; c < in.C; ++c) if (!in.cacheEps[c].empty()) caches.push_back(c);
    if (caches.empty()) return;
    auto rnd = [&](size_t n) { return (size_t)(rng() % n); };
    uniform_real_distribution<double> unit(0.0, 1.0);
    auto vsave = [&](int v) {
        ll s = 0;
        for (int r : in.vidReq[v]) s += in.rN[r] * (in.LD[in.rE[r]] - rp.b1[r]);
        return s;
    };

    seconds = min(seconds, secondsLeft());
    auto start = chrono::steady_clock::now();
    ll total = rp.saved(), bestTotal = total;
    bool atBest = true;
    vector<vector<int>> bestLists;
    long long iters = 0, kept = 0, better = 0;
    double t = 0, lastReport = -2;
    while (t < seconds) {
        if ((++iters & 255) == 0) {
            t = chrono::duration<double>(chrono::steady_clock::now() - start).count();
            if (t - lastReport >= 2) { fprintf(stderr, "  moves score %lld\n", bestTotal * 1000 / in.totalReq); lastReport = t; }
        }
        int c1 = caches[rnd(caches.size())];
        int e = in.cacheEps[c1][rnd(in.cacheEps[c1].size())].first;
        int a = p.list[c1].empty() ? -1 : p.list[c1][rnd(p.list[c1].size())];
        int c2 = -1, b;
        if (a >= 0 && rng() % 2) {          // swap with a video of a neighbouring cache
            c2 = in.epCaches[e][rnd(in.epCaches[e].size())].first;
            if (c2 == c1 || p.list[c2].empty()) continue;
            b = p.list[c2][rnd(p.list[c2].size())];
            if (b == a || p.has(c2, a) || p.has(c1, b)) continue;
            if (p.rem[c1] + in.size[a] < in.size[b] || p.rem[c2] + in.size[b] < in.size[a]) continue;
        } else {                            // replace a (or add) by a video requested nearby
            if (in.epReq[e].empty()) continue;
            b = in.rV[in.epReq[e][rnd(in.epReq[e].size())]];
            if (p.has(c1, b)) continue;
            if (a >= 0 && p.rem[c1] >= in.size[b]) a = -1;   // fits without removing anything
            if (p.rem[c1] + (a >= 0 ? in.size[a] : 0) < in.size[b]) continue;
        }
        auto apply = [&]() {
            if (a >= 0) rp.delV(c1, a);
            if (c2 >= 0) { rp.delV(c2, b); rp.addV(c2, a); }
            rp.addV(c1, b);
        };
        auto undo = [&]() {
            rp.delV(c1, b);
            if (c2 >= 0) { rp.delV(c2, a); rp.addV(c2, b); }
            if (a >= 0) rp.addV(c1, a);
        };
        ll before = (a >= 0 ? vsave(a) : 0) + vsave(b);
        apply();
        ll delta = (a >= 0 ? vsave(a) : 0) + vsave(b) - before;
        bool accept = delta >= 0;
        if (!accept && temp > 0) {
            double T = temp * (1 - t / seconds);
            accept = T > 0 && unit(rng) < exp((double)delta * 1000 / in.totalReq / T);
            if (accept && atBest) { undo(); bestLists = p.list; apply(); }   // leaving the best: save it
        }
        if (!accept) { undo(); continue; }
        ++kept; better += delta > 0; total += delta;
        if (total > bestTotal) { bestTotal = total; atBest = true; }
        else if (delta < 0) atBest = false;
    }
    if (!atBest)
        for (int c = 0; c < in.C; ++c) rp.setCache(c, bestLists[c]);
    fprintf(stderr, "  moves: %lld iterations, %lld kept, %lld improving\n", iters, kept, better);
}

// ---------------------------------------------------------------- main

int main(int argc, char** argv) {
    if (argc < 3) {
        fprintf(stderr, "usage: solver <input.in> <output.out> [options]\n");
        return 1;
    }
    const char* inPath = argv[1];
    const char* outPath = argv[2];
    int rounds = 5, candidates = 400, kicks = 0, kickSize = 3;
    unsigned seed = 1;
    bool global = true, evict = true, swap = true, repack = false;
    const char* start = nullptr;
    double lnsSeconds = 0, timeLimit = 0, temp = 0, movesSeconds = 0;
    int lnsSize = 2;
    for (int i = 3; i < argc; ++i) {
        string a = argv[i];
        auto val = [&]() { if (i + 1 >= argc) { fprintf(stderr, "%s needs a value\n", a.c_str()); exit(1); } return argv[++i]; };
        if (a == "--rounds") rounds = atoi(val());
        else if (a == "--strategy") global = string(val()) != "per-cache";
        else if (a == "--no-evict") evict = false;
        else if (a == "--no-swap") swap = false;
        else if (a == "--repack") repack = true;
        else if (a == "--candidates") candidates = atoi(val());
        else if (a == "--kicks") { kicks = atoi(val()); repack = true; }
        else if (a == "--kick-size") kickSize = atoi(val());
        else if (a == "--seed") seed = atoi(val());
        else if (a == "--start") start = val();
        else if (a == "--lns") { lnsSeconds = atof(val()); repack = true; }
        else if (a == "--lns-size") lnsSize = atoi(val());
        else if (a == "--temp") temp = atof(val());
        else if (a == "--moves") { movesSeconds = atof(val()); repack = true; }
        else if (a == "--time-limit") timeLimit = atof(val());
        else { fprintf(stderr, "unknown option %s\n", a.c_str()); return 1; }
    }

    auto t0 = chrono::steady_clock::now();
    auto secs = [&]() { return chrono::duration<double>(chrono::steady_clock::now() - t0).count(); };
    if (timeLimit > 0)
        g_deadline = t0 + chrono::duration_cast<chrono::steady_clock::duration>(chrono::duration<double>(timeLimit));

    Inst in = parse(inPath);
    fprintf(stderr, "%s: V=%d E=%d R=%d C=%d X=%d (%.1fs)\n", inPath, in.V, in.E, in.R, in.C, in.X, secs());
    Placement p(in);
    if (start) {
        readOut(start, in, p);
        fprintf(stderr, "start %s: %lld\n", start, scoreOf(in, p));
    } else {
        Solver s(in, p);
        s.solve(rounds, global, evict, swap);
        fprintf(stderr, "greedy: %lld (%.1fs)\n", scoreOf(in, p), secs());
    }
    writeOut(outPath, in, p);

    if (repack) {
        Repacker rp(in, p);
        vector<int> order(in.C);
        iota(order.begin(), order.end(), 0);
        rp.sweepUntilStable(candidates, order, true);
        ll best = scoreOf(in, p);
        fprintf(stderr, "re-pack: %lld (%.1fs)\n", best, secs());
        writeOut(outPath, in, p);

        mt19937 rng(seed);
        vector<vector<int>> bestLists = p.list;
        for (int k = 0; k < kicks && !timeUp(); ++k) {
            vector<int> pick = order;
            shuffle(pick.begin(), pick.end(), rng);
            for (int i = 0; i < min(kickSize, in.C); ++i) rp.setCache(pick[i], {});
            shuffle(order.begin(), order.end(), rng);
            rp.sweepUntilStable(candidates, order, false);
            ll s = scoreOf(in, p);
            if (s > best) {
                best = s; bestLists = p.list;
                writeOut(outPath, in, p);
                fprintf(stderr, "  kick %d: %lld (new best, %.1fs)\n", k + 1, s, secs());
            } else {
                for (int c = 0; c < in.C; ++c) rp.setCache(c, bestLists[c]);
            }
        }
        if (kicks) fprintf(stderr, "after kicks: %lld\n", best);

        mt19937_64 rng64(seed);
        auto finish = [&](const char* what) {
            rp.sweepUntilStable(candidates, order, false);       // polish
            ll s = scoreOf(in, p);
            fprintf(stderr, "%s + re-pack: %lld (%.1fs)\n", what, s, secs());
            if (s > best) { best = s; writeOut(outPath, in, p); }
        };
        if (lnsSeconds > 0) { lns(rp, lnsSeconds, lnsSize, candidates, rng64, temp); finish("lns"); }
        if (movesSeconds > 0) { moves(rp, movesSeconds, rng64, temp); finish("moves"); }
    }
    fprintf(stderr, "final %lld (%.1fs)\n", scoreOf(in, p), secs());
    return 0;
}
