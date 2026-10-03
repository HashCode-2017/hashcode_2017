# Class console — submit, visualise, rank

Every group has its own algorithm. The console doesn't care how you solved it or in which
language: upload the file you would submit and it scores it, ranks it, and plays it back
through all six acts of the story, ending on an animated reveal of your new rank.

## For players

1. Open the console, **Create account**, pick your group (A–L, at most 4 people each).
2. **Data set**: pick one and hit **download .in** to get the exact input file.
3. Run your algorithm on it, then **submit solution** on that same card and drop your `.out`
   (and optionally a `.trace`).
4. Watch your placement replay, then see where it puts you and your group.
5. **Statistics** takes your run apart (every cache, every endpoint, sortable) and shows how
   the whole class is doing per data set, per group and over time.

### `.out` — required

The normal Hash Code submission file:

```
3          number of cache servers described
0 2        cache 0 holds video 2
1 3 1      cache 1 holds videos 3 and 1
2 0 1      cache 2 holds videos 0 and 1
```

### `.trace` — optional, makes the placement act show *your* algorithm

One line per decision, in the order your code made it:

```
# round 1      optional marker: starts a new step in the timeline
+ 1 3          put video 3 into cache 1
+ 0 2          put video 2 into cache 0
- 1 3          take video 3 back out
```

Add a print wherever your code adds or removes a video:

```python
trace = open("kittens.trace", "w")
trace.write(f"+ {cache} {video}\n")     # when you place
trace.write(f"- {cache} {video}\n")     # when you evict, if you ever do
```

You don't log gains: the console recomputes the latency every move saved from the `.in`. It
also flags steps that overflow a cache, add a video twice or remove one that isn't there, and
checks that the trace ends exactly where your `.out` does. The `.out` is always what's scored.

Our reference solver writes one with `python solution.py in.in out.out --trace out.trace`.

### Scoring

Groups compete, not individuals. Everyone signs in with their own account, but a group works
as one shared account: every member sees, replays and is ranked through all of the group's
submissions. On each data set the group's **latest** submission is its result: a new upload
replaces the previous one, higher or lower. The final score is the sum over the **evaluation
data sets** (chosen by the admin and listed at the top of the leaderboard, with download
links). A latest upload that overflows a cache counts 0 until the group submits a valid one.
Ties go to the group that settled on its result first. Every other data set has its own
practice board.

## For whoever hosts it

```bash
pip install -r api/requirements.txt
cd ui && npm install && npm run build && cd ..
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000   # 0.0.0.0: reachable on the LAN
```

Classmates open `http://<your-ip>:8000`.

**Accounts.** With Supabase configured, accounts live in Supabase Auth (Authentication → Users
in the dashboard). The server creates them already confirmed, so no confirmation email is sent;
players sign in with their email or their username, and logging out revokes the Supabase
session. Supabase rate-limits password sign-ins per IP, and every sign-in comes from the
hosting machine: if a whole class signs in at once, raise the limit under Authentication →
Rate Limits.

**Admin.** Admins are the `ADMIN_EMAIL` account plus everyone in the admin groups
(`ADMIN_GROUPS` in `.env`, default `D,P`: group D and the Professors group). Joining an admin
group at sign-up needs `ADMIN_CODE` from `.env`, so hand it only to those people; admins can
also move anyone into or out of any group from the **Admin** page. Professors take no seat and
are never ranked; group D competes like every other group. On first start the server creates
the `ADMIN_EMAIL` user from `ADMIN_PASSWORD`; after that its password belongs to Supabase.
The **Admin** page picks the evaluation data sets that make up the final ranking. Only admins
can run the reference solver; players only ever see their own group's submissions.

**Storage.** With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env` (gitignored), accounts and
scores live in Supabase; create the tables once by running `supabase/schema.sql` in the
dashboard's SQL editor. Without them, everything goes to a local SQLite file in `.data/`.
The replays themselves (`.runs/`) stay on the hosting machine.
