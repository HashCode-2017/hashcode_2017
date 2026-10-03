"""Accounts, groups, sessions and scored submissions.

Two interchangeable stores behind one set of functions:

  * Supabase when SUPABASE_URL and SUPABASE_SECRET_KEY are set -- the shared
    class database. Accounts and passwords live in Supabase Auth (created
    pre-confirmed through the admin API, so no confirmation email is ever
    sent); groups, scores and sessions live in the `hc_*` tables, created once
    with `supabase/schema.sql`.
  * SQLite in `.data/` otherwise, so the console still runs offline, with
    salted PBKDF2 password hashes instead of Supabase Auth.

Sessions are random tokens in an HttpOnly cookie; with Supabase each one also
keeps the Auth refresh token, so logging out revokes the session there too.
Ranking is computed here in Python from the scored rows, so both stores rank
identically.
"""
import hashlib
import hmac
import os
import secrets
import sqlite3
import threading
import time

from . import ROOT

GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L"]   # the competing groups
PROFESSORS = "P"                                                     # admins, never ranked
ALL_GROUPS = GROUPS + [PROFESSORS]
GROUP_SIZE = 4


def admin_groups():
    """Groups whose members are admins: ADMIN_GROUPS in `.env`, default D + professors."""
    raw = os.environ.get("ADMIN_GROUPS") or f"D,{PROFESSORS}"
    return {g.strip().upper() for g in raw.split(",") if g.strip()}


def _capacity(group):
    return None if group == PROFESSORS else GROUP_SIZE
PBKDF2_ROUNDS = 200_000


class AuthError(ValueError):
    pass


def _hash(password, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS).hex()


# ======================================================================
# SQLite

class SqliteStore:
    name = "sqlite"

    def __init__(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.lock = threading.Lock()
        self.c = sqlite3.connect(path, check_same_thread=False)
        self.c.row_factory = sqlite3.Row
        self.c.executescript("""
            CREATE TABLE IF NOT EXISTS hc_users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                grp TEXT, salt TEXT NOT NULL, pw_hash TEXT NOT NULL,
                created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS hc_sessions (
                token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS hc_submissions (
                id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, instance TEXT NOT NULL,
                run_id TEXT UNIQUE NOT NULL, score INTEGER NOT NULL, valid INTEGER NOT NULL,
                source TEXT NOT NULL, created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS hc_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """)
        for ddl in ("ALTER TABLE hc_users ADD COLUMN email TEXT",
                    "ALTER TABLE hc_sessions ADD COLUMN sb_refresh TEXT"):
            try:
                self.c.execute(ddl)
            except sqlite3.OperationalError:
                pass                                 # already there

    def _all(self, sql, args=()):
        with self.lock:
            return [dict(r) for r in self.c.execute(sql, args).fetchall()]

    def _write(self, sql, args=()):
        with self.lock:
            cur = self.c.execute(sql, args)
            self.c.commit()
            return cur.lastrowid

    def group_members(self):
        return {r["grp"]: r["n"] for r in self._all("SELECT grp, COUNT(*) n FROM hc_users GROUP BY grp")}

    def user_by_name(self, username):
        rows = self._all("SELECT * FROM hc_users WHERE username = ?", (username,))
        return rows[0] if rows else None

    def user_by_id(self, user_id):
        rows = self._all("SELECT * FROM hc_users WHERE id = ?", (user_id,))
        return rows[0] if rows else None

    def update_user_group(self, user_id, group):
        with self.lock:
            n = self.c.execute("SELECT COUNT(*) FROM hc_users WHERE grp = ? AND id != ?",
                               (group, user_id)).fetchone()[0]
            if n >= GROUP_SIZE:
                raise AuthError(f"group {group} is full ({GROUP_SIZE} members)")
            self.c.execute("UPDATE hc_users SET grp = ? WHERE id = ?", (group, user_id))
            self.c.commit()

    def update_password(self, user_id, salt, pw_hash):
        self._write("UPDATE hc_users SET salt = ?, pw_hash = ? WHERE id = ?", (salt, pw_hash, user_id))

    def get_setting(self, key):
        import json
        rows = self._all("SELECT value FROM hc_settings WHERE key = ?", (key,))
        return json.loads(rows[0]["value"]) if rows else None

    def set_setting(self, key, value):
        import json
        self._write("INSERT INTO hc_settings (key, value) VALUES (?, ?)"
                    " ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, json.dumps(value)))

    def user_by_email(self, email):
        rows = self._all("SELECT * FROM hc_users WHERE lower(email) = lower(?)", (email,))
        return rows[0] if rows else None

    def insert_user(self, username, group, salt, pw_hash, auth_id=None, email=None):
        with self.lock:
            # Check-and-insert under one lock: nobody takes the last seat twice.
            if self.c.execute("SELECT 1 FROM hc_users WHERE username = ?", (username,)).fetchone():
                raise AuthError("that username is taken")
            n = self.c.execute("SELECT COUNT(*) FROM hc_users WHERE grp = ?", (group,)).fetchone()[0]
            if group is not None and n >= GROUP_SIZE:
                raise AuthError(f"group {group} is full ({GROUP_SIZE} members)")
            cur = self.c.execute(
                "INSERT INTO hc_users (username, grp, salt, pw_hash, email, created) VALUES (?, ?, ?, ?, ?, ?)",
                (username, group, salt, pw_hash, email, time.time()))
            self.c.commit()
            return cur.lastrowid

    def insert_session(self, token, user_id, refresh=None):
        self._write("INSERT INTO hc_sessions (token, user_id, created, sb_refresh) VALUES (?, ?, ?, ?)",
                    (token, user_id, time.time(), refresh))

    def session_refresh(self, token):
        rows = self._all("SELECT sb_refresh FROM hc_sessions WHERE token = ?", (token,))
        return rows[0]["sb_refresh"] if rows else None

    def delete_session(self, token):
        self._write("DELETE FROM hc_sessions WHERE token = ?", (token,))

    def user_for_token(self, token):
        rows = self._all("SELECT u.* FROM hc_sessions s JOIN hc_users u ON u.id = s.user_id"
                         " WHERE s.token = ?", (token,))
        return rows[0] if rows else None

    def insert_submission(self, row):
        return self._write(
            "INSERT INTO hc_submissions (user_id, instance, run_id, score, valid, source, created)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (row["user_id"], row["instance"], row["run_id"], row["score"], int(row["valid"]),
             row["source"], time.time()))

    def submission_by_run(self, run_id):
        rows = self._all("SELECT * FROM hc_submissions WHERE run_id = ?", (run_id,))
        return rows[0] if rows else None

    def submissions_for(self, user_id):
        return self._all("SELECT id, instance, run_id, score, valid, source, created"
                         " FROM hc_submissions WHERE user_id = ? ORDER BY id DESC", (user_id,))

    def valid_submissions(self, instances):
        marks = ",".join("?" * len(instances))
        return self._all(f"SELECT id, user_id, instance, score FROM hc_submissions"
                         f" WHERE valid = 1 AND instance IN ({marks})", list(instances))

    def users(self):
        return self._all("SELECT id, username, grp FROM hc_users")

    def all_submissions(self):
        return self._all("SELECT id, user_id, instance, run_id, score, valid, source, created FROM hc_submissions")


# ======================================================================
# Supabase

class SupabaseStore:
    """PostgREST with the secret key. Server-side only: the key bypasses RLS."""
    name = "supabase"

    def __init__(self, url, key, publishable):
        import httpx
        self.http = httpx.Client(
            base_url=url.rstrip("/") + "/rest/v1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=15,
        )
        # Supabase Auth: the admin API (secret key) creates and finds users; the
        # password grant and logout are the ordinary client calls.
        self.auth_admin = httpx.Client(
            base_url=url.rstrip("/") + "/auth/v1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=15,
        )
        self.auth = httpx.Client(
            base_url=url.rstrip("/") + "/auth/v1",
            headers={"apikey": publishable or key},
            timeout=15,
        )

    # ---- Supabase Auth

    def auth_create(self, email, password):
        """A confirmed user straight away: no email is sent, nothing to validate."""
        r = self.auth_admin.post("/admin/users", json={
            "email": email, "password": password, "email_confirm": True,
        })
        if r.status_code < 300:
            return r.json()["id"]
        body = r.json() if r.content else {}
        code = body.get("error_code") or body.get("code")
        if code == "email_exists" or "already" in str(body.get("msg", "")):
            raise AuthError("that email already has an account")
        if code == "weak_password":
            raise AuthError(body.get("msg") or "password is too weak")
        raise AuthError(body.get("msg") or f"could not create the account ({r.status_code})")

    def auth_find(self, email):
        """Auth user id for an email, paging through the admin listing."""
        page = 1
        while True:
            r = self.auth_admin.get("/admin/users", params={"page": page, "per_page": 200})
            r.raise_for_status()
            users = r.json().get("users", [])
            for u in users:
                if (u.get("email") or "").lower() == email.lower():
                    return u["id"]
            if len(users) < 200:
                return None
            page += 1

    def auth_delete(self, auth_id):
        self.auth_admin.delete(f"/admin/users/{auth_id}")

    def auth_sign_in(self, email, password):
        r = self.auth.post("/token", params={"grant_type": "password"},
                           json={"email": email, "password": password})
        if r.status_code == 200:
            body = r.json()
            return body["user"]["id"], body["refresh_token"]
        body = r.json() if r.content else {}
        if body.get("error_code") == "over_request_rate_limit" or r.status_code == 429:
            raise AuthError("too many sign-ins right now, try again in a minute")
        raise AuthError("wrong email/username or password")

    def auth_sign_out(self, refresh):
        """Revoke the Supabase session behind a refresh token (best effort)."""
        r = self.auth.post("/token", params={"grant_type": "refresh_token"},
                           json={"refresh_token": refresh})
        if r.status_code == 200:
            access = r.json()["access_token"]
            self.auth.post("/logout", params={"scope": "local"},
                           headers={"Authorization": f"Bearer {access}"})

    def _get(self, table, **params):
        r = self.http.get(f"/{table}", params=params)
        r.raise_for_status()
        return r.json()

    def _insert(self, table, row):
        r = self.http.post(f"/{table}", json=row, headers={"Prefer": "return=representation"})
        if r.status_code >= 400:
            return None, r.json() if r.content else {}
        return r.json()[0], None

    def group_members(self):
        counts = {}
        for r in self._get("hc_users", select="grp"):
            counts[r["grp"]] = counts.get(r["grp"], 0) + 1
        return counts

    def user_by_name(self, username):
        # ilike without wildcards is a case-insensitive equality; escape the
        # two characters it would otherwise treat as patterns.
        safe = username.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        rows = self._get("hc_users", select="*", username=f"ilike.{safe}")
        return rows[0] if rows else None

    def user_by_email(self, email):
        rows = self._get("hc_users", select="*", email=f"ilike.{email.replace('_', chr(92) + '_')}")
        return rows[0] if rows else None

    def user_by_auth(self, auth_id):
        rows = self._get("hc_users", select="*", auth_id=f"eq.{auth_id}")
        return rows[0] if rows else None

    def link_auth(self, user_id, auth_id, email):
        err = self._patch("hc_users", {"id": f"eq.{user_id}"}, {"auth_id": auth_id, "email": email})
        if err is not None:
            raise RuntimeError(f"supabase: {err}")

    def delete_user(self, user_id):
        self.http.delete("/hc_users", params={"id": f"eq.{user_id}"})

    def insert_user(self, username, group, salt, pw_hash, auth_id=None, email=None):
        row, err = self._insert("hc_users", {"username": username, "grp": group,
                                             "salt": salt, "pw_hash": pw_hash,
                                             "auth_id": auth_id, "email": email})
        if err is not None:
            if err.get("code") == "23505":
                raise AuthError("that username is taken")
            if err.get("code") == "P0001":           # raised by the group-cap trigger
                raise AuthError(err.get("message", f"group {group} is full"))
            raise RuntimeError(f"supabase: {err}")
        return row["id"]

    def user_by_id(self, user_id):
        rows = self._get("hc_users", select="*", id=f"eq.{user_id}")
        return rows[0] if rows else None

    def _patch(self, table, match, values):
        r = self.http.patch(f"/{table}", params=match, json=values)
        if r.status_code >= 400:
            return r.json() if r.content else {"message": r.text}
        return None

    def update_user_group(self, user_id, group):
        err = self._patch("hc_users", {"id": f"eq.{user_id}"}, {"grp": group})
        if err is not None:
            if err.get("code") == "P0001":           # the group-cap trigger
                raise AuthError(err.get("message", f"group {group} is full"))
            raise RuntimeError(f"supabase: {err}")

    def update_password(self, user_id, salt, pw_hash):
        err = self._patch("hc_users", {"id": f"eq.{user_id}"}, {"salt": salt, "pw_hash": pw_hash})
        if err is not None:
            raise RuntimeError(f"supabase: {err}")

    def get_setting(self, key):
        rows = self._get("hc_settings", select="value", key=f"eq.{key}")
        return rows[0]["value"] if rows else None

    def set_setting(self, key, value):
        r = self.http.post("/hc_settings", json={"key": key, "value": value},
                           headers={"Prefer": "resolution=merge-duplicates"})
        if r.status_code >= 400:
            raise RuntimeError(f"supabase: {r.text}")

    def insert_session(self, token, user_id, refresh=None):
        _, err = self._insert("hc_sessions", {"token": token, "user_id": user_id, "sb_refresh": refresh})
        if err is not None:
            raise RuntimeError(f"supabase: {err}")

    def session_refresh(self, token):
        rows = self._get("hc_sessions", select="sb_refresh", token=f"eq.{token}")
        return rows[0]["sb_refresh"] if rows else None

    def delete_session(self, token):
        self.http.delete("/hc_sessions", params={"token": f"eq.{token}"})

    def user_for_token(self, token):
        rows = self._get("hc_sessions", select="hc_users(id,username,grp)", token=f"eq.{token}")
        return rows[0]["hc_users"] if rows and rows[0].get("hc_users") else None

    def insert_submission(self, row):
        out, err = self._insert("hc_submissions", row)
        if err is not None:
            raise RuntimeError(f"supabase: {err}")
        return out["id"]

    def submission_by_run(self, run_id):
        rows = self._get("hc_submissions", select="*", run_id=f"eq.{run_id}")
        return rows[0] if rows else None

    def submissions_for(self, user_id):
        rows = self._get("hc_submissions", select="id,instance,run_id,score,valid,source,created",
                         user_id=f"eq.{user_id}", order="id.desc")
        for r in rows:
            r["valid"] = int(r["valid"])
            r["created"] = _epoch(r["created"])
        return rows

    def valid_submissions(self, instances):
        return self._get("hc_submissions", select="id,user_id,instance,score", valid="eq.true",
                         instance=f"in.({','.join(instances)})")

    def users(self):
        return self._get("hc_users", select="id,username,grp")

    def save_run(self, run_id, instance, data):
        r = self.http.post("/hc_runs", json={"id": run_id, "instance": instance, "data": data},
                           headers={"Prefer": "resolution=merge-duplicates"})
        if r.status_code >= 400:
            raise RuntimeError(f"supabase: {r.text[:200]}")

    def load_run(self, run_id):
        rows = self._get("hc_runs", select="data", id=f"eq.{run_id}")
        return rows[0]["data"] if rows else None

    def all_submissions(self):
        rows = self._get("hc_submissions", select="id,user_id,instance,run_id,score,valid,source,created")
        for r in rows:
            r["created"] = _epoch(r["created"])
        return rows


def _epoch(ts):
    from datetime import datetime
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()


# ======================================================================
# the store in use

_store = None
_store_lock = threading.Lock()


def store():
    global _store
    with _store_lock:
        if _store is None:
            url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SECRET_KEY")
            if url and key:
                _store = SupabaseStore(url.strip(), key.strip(),
                                       (os.environ.get("SUPABASE_PUBLISHABLE_KEY") or "").strip())
            else:
                _store = SqliteStore(os.environ.get(
                    "HASHCODE_DB", os.path.join(ROOT, ".data", "app.db")))
            _ensure_admin(_store)
        return _store


# ----------------------------------------------------------------- admin
#
# The admin is the account whose email is ADMIN_EMAIL (from `.env`). Its row
# is named after that email, holds no group seat, and cannot be claimed by
# sign-up because ordinary usernames may not contain '@'. With Supabase, the
# Auth user is created from ADMIN_PASSWORD the first time only: after that the
# password belongs to Supabase (change it in the dashboard). Offline, the
# local hash is re-synced to ADMIN_PASSWORD at every start.

def admin_email():
    return (os.environ.get("ADMIN_EMAIL") or "").strip().lower()


def _ensure_admin(st):
    email, password = admin_email(), (os.environ.get("ADMIN_PASSWORD") or "").strip()
    if not email or not password:
        return
    row = st.user_by_name(email)
    if isinstance(st, SupabaseStore):
        try:
            auth_id = st.auth_create(email, password)
        except AuthError:                            # already exists in Supabase Auth
            auth_id = st.auth_find(email)
        if auth_id is None:
            return
        if row is None:
            st.insert_user(email, None, None, None, auth_id=auth_id, email=email)
        elif row.get("auth_id") != auth_id:
            st.link_auth(row["id"], auth_id, email)
        return
    if row is None:
        salt = secrets.token_bytes(16)
        st.insert_user(email, None, salt.hex(), _hash(password, salt))
    elif not hmac.compare_digest(_hash(password, bytes.fromhex(row["salt"])), row["pw_hash"]):
        salt = secrets.token_bytes(16)
        st.update_password(row["id"], salt.hex(), _hash(password, salt))


def is_admin(username, group=None):
    """The ADMIN_EMAIL account, or anyone in an admin group (D and Professors)."""
    if group and group in admin_groups():
        return True
    return bool(admin_email()) and (username or "").lower() == admin_email()


def _public(row):
    return {"id": row["id"], "username": row["username"], "group": row["grp"],
            "isAdmin": is_admin(row["username"], row["grp"])}


RANKED_KEY = "ranked_instances"


def ranked_instances(default):
    value = store().get_setting(RANKED_KEY)
    return list(value) if value else list(default)


def set_ranked_instances(instances):
    store().set_setting(RANKED_KEY, list(instances))


def people():
    """Everyone but the ADMIN_EMAIL account, with how much they have submitted."""
    counts = {}
    for s in store().all_submissions():
        counts[s["user_id"]] = counts.get(s["user_id"], 0) + 1
    out = []
    for u in store().users():
        if u["grp"] is None:                         # the ADMIN_EMAIL account
            continue
        out.append({"id": u["id"], "username": u["username"], "group": u["grp"],
                    "isAdmin": is_admin(u["username"], u["grp"]),
                    "submissions": counts.get(u["id"], 0)})
    out.sort(key=lambda r: ((r["group"] or "~"), r["username"].lower()))
    return out


def set_group(user_id, group):
    """Admins may move anyone, into admin groups too: no code needed."""
    if group not in ALL_GROUPS:
        raise AuthError(f"group must be one of {' '.join(ALL_GROUPS)}")
    row = store().user_by_id(user_id)
    if row is None or row["grp"] is None:
        raise AuthError("no such player")
    store().update_user_group(user_id, group)
    return _public(dict(row, grp=group))


def group_counts():
    counts = store().group_members()
    admins = admin_groups()
    return [{"group": g, "members": counts.get(g, 0), "capacity": _capacity(g),
             "admin": g in admins, "label": "Professors" if g == PROFESSORS else f"Group {g}"}
            for g in ALL_GROUPS]


def _code_ok(code):
    expected = (os.environ.get("ADMIN_CODE") or "").strip()
    return bool(expected) and hmac.compare_digest((code or "").strip(), expected)


def _valid_email(email):
    local, _, domain = email.partition("@")
    return bool(local) and "." in domain and " " not in email and len(email) <= 254


def register(username, email, password, group, code=None):
    """Create the account (in Supabase Auth when available) and its player row."""
    username = (username or "").strip()
    email = (email or "").strip().lower()
    if not (2 <= len(username) <= 24) or not all(ch.isalnum() or ch in "._-" for ch in username):
        raise AuthError("username: 2-24 letters, digits, '.', '_' or '-'")
    if not _valid_email(email):
        raise AuthError("enter a valid email address")
    if len(password or "") < 6:
        raise AuthError("password: at least 6 characters")
    if group not in ALL_GROUPS:
        raise AuthError(f"group must be one of {' '.join(ALL_GROUPS)}")
    # Joining a group with admin rights takes the code the admin hands out.
    if group in admin_groups() and not _code_ok(code):
        raise AuthError("this group has admin rights: enter the admin code you were given")
    st = store()
    if st.user_by_name(username):
        raise AuthError("that username is taken")
    if st.user_by_email(email):
        raise AuthError("that email already has an account")
    # Fail fast on a full group before creating anything in Supabase Auth.
    if _capacity(group) and st.group_members().get(group, 0) >= GROUP_SIZE:
        raise AuthError(f"group {group} is full ({GROUP_SIZE} members)")

    if isinstance(st, SupabaseStore):
        auth_id = st.auth_create(email, password)
        try:
            uid = st.insert_user(username, group, None, None, auth_id=auth_id, email=email)
        except Exception:
            st.auth_delete(auth_id)                  # don't leave an orphan login behind
            raise
    else:
        salt = secrets.token_bytes(16)
        uid = st.insert_user(username, group, salt.hex(), _hash(password, salt), email=email)
    return {"id": uid, "username": username, "group": group, "isAdmin": False}


def login(identifier, password):
    """Sign in with an email or a username. Returns (user, refresh token or None)."""
    identifier = (identifier or "").strip()
    st = store()
    row = None if "@" in identifier else st.user_by_name(identifier)
    email = identifier.lower() if "@" in identifier else (row or {}).get("email")
    if not email:
        raise AuthError("wrong email/username or password")

    if not isinstance(st, SupabaseStore):
        row = row or st.user_by_email(email) or st.user_by_name(email)
        if row is None or not row.get("salt") or not hmac.compare_digest(
                _hash(password or "", bytes.fromhex(row["salt"])), row["pw_hash"]):
            raise AuthError("wrong email/username or password")
        return _public(row), None

    auth_id, refresh = st.auth_sign_in(email, password or "")
    row = st.user_by_auth(auth_id)
    if row is None:
        # An auth user made elsewhere (e.g. in the dashboard): adopt a row with
        # the same email, or create the admin's on the fly.
        row = st.user_by_email(email) or (st.user_by_name(email) if is_admin(email) else None)
        if row is not None:
            st.link_auth(row["id"], auth_id, email)
        elif is_admin(email):
            st.insert_user(email, None, None, None, auth_id=auth_id, email=email)
            row = st.user_by_auth(auth_id)
        else:
            st.auth_sign_out(refresh)
            raise AuthError("this account has no player profile yet: create one with 'Create account'")
    return _public(row), refresh


def new_session(user_id, refresh=None):
    token = secrets.token_urlsafe(32)
    store().insert_session(token, user_id, refresh)
    return token


def end_session(token):
    st = store()
    refresh = st.session_refresh(token)
    st.delete_session(token)
    if refresh and isinstance(st, SupabaseStore):
        try:
            st.auth_sign_out(refresh)
        except Exception:
            pass                                     # our session is gone either way


def user_for_token(token):
    if not token:
        return None
    row = store().user_for_token(token)
    return _public(row) if row else None


def record_submission(user_id, instance, run_id, score, valid, source):
    return store().insert_submission({
        "user_id": user_id, "instance": instance, "run_id": run_id,
        "score": int(score), "valid": bool(valid), "source": source,
    })


def submission_by_run(run_id):
    sub = store().submission_by_run(run_id)
    if sub is None:
        return None
    users = {u["id"]: u for u in store().users()}
    u = users[sub["user_id"]]
    return dict(sub, username=u["username"], grp=u["grp"], valid=bool(sub["valid"]))


def submissions_for(user_id):
    return store().submissions_for(user_id)


# ------------------------------------------------------------------ replays
#
# A finished run (event log + analysis) is cached on the server's disk, but a
# host like Heroku wipes that disk on every restart. With Supabase the run is
# also kept in `hc_runs`, gzipped: that copy is what keeps old submissions
# replayable. Offline, the disk is the only copy and these are no-ops.

def save_run(run_id, instance, record_json):
    import base64, gzip
    st = store()
    if isinstance(st, SupabaseStore):
        packed = base64.b64encode(gzip.compress(record_json.encode("utf-8"))).decode("ascii")
        st.save_run(run_id, instance, packed)


def load_run(run_id):
    import base64, gzip
    st = store()
    if not isinstance(st, SupabaseStore):
        return None
    packed = st.load_run(run_id)
    return gzip.decompress(base64.b64decode(packed)).decode("utf-8") if packed else None


def group_submissions(user):
    """A group is one shared account: every member sees every member's uploads.
    The admin, who has no group, sees their own."""
    users = {u["id"]: u for u in store().users()}
    if user.get("group"):
        ids = {uid for uid, u in users.items() if u["grp"] == user["group"]}
    else:
        ids = {user["id"]}
    rows = [dict(s, valid=int(bool(s["valid"])), username=users[s["user_id"]]["username"])
            for s in store().all_submissions() if s["user_id"] in ids]
    rows.sort(key=lambda r: -r["id"])
    return rows


def same_group(username, user):
    """Whether `username` shares `user`'s group (so their runs are shared)."""
    if not user.get("group"):
        return False
    row = store().user_by_name(username or "")
    return row is not None and row["grp"] == user["group"]


def class_stats():
    """Aggregates over every submission: per data set, per group, and over time."""
    users = {u["id"]: u for u in store().users()}
    subs = store().all_submissions()

    per_instance = {}
    for s in subs:
        d = per_instance.setdefault(s["instance"], {
            "instance": s["instance"], "submissions": 0, "invalid": 0, "withTrace": 0,
            "best": {}, "groups": set(),
        })
        d["submissions"] += 1
        d["withTrace"] += s["source"] == "trace"
        if not s["valid"]:
            d["invalid"] += 1
            continue
        u = users.get(s["user_id"])
        if u is None:
            continue
        d["best"][u["id"]] = max(d["best"].get(u["id"], 0), s["score"])
        d["groups"].add(u["grp"])

    instances = []
    for d in per_instance.values():
        best = sorted(d["best"].values())
        n = len(best)
        instances.append({
            "instance": d["instance"], "submissions": d["submissions"], "invalid": d["invalid"],
            "withTrace": d["withTrace"], "players": n, "groups": len(d["groups"]),
            "best": best[-1] if n else None,
            "median": (best[n // 2] if n % 2 else (best[n // 2 - 1] + best[n // 2]) // 2) if n else None,
            "mean": sum(best) // n if n else None,
            "lowest": best[0] if n else None,
            # one value per player: their best, for the distribution chart
            "playerBests": best,
        })
    instances.sort(key=lambda r: -r["submissions"])

    groups = {}
    for u in users.values():
        if u["grp"] in (None, PROFESSORS):     # admin account and professors don't compete
            continue
        g = groups.setdefault(u["grp"], {"group": u["grp"], "members": 0, "submissions": 0})
        g["members"] += 1
    for s in subs:
        u = users.get(s["user_id"])
        if u and u["grp"] in groups:
            groups[u["grp"]]["submissions"] += 1

    # Submissions per hour, oldest first: the class's working rhythm.
    by_hour = {}
    for s in subs:
        h = int(s["created"] // 3600) * 3600
        by_hour[h] = by_hour.get(h, 0) + 1

    return {
        "players": len(users),
        "submissions": len(subs),
        "valid": sum(1 for s in subs if s["valid"]),
        "withTrace": sum(1 for s in subs if s["source"] == "trace"),
        "instances": instances,
        "groups": sorted(groups.values(), key=lambda g: g["group"]),
        "timeline": sorted(by_hour.items()),
    }


def leaderboard(instances, by="user", upto=None):
    """Ranked rows: the LATEST submission per (group or player, instance),
    summed over `instances`.

    A new upload replaces the previous result on that data set, whether it
    scores higher or lower, so the board always shows where each group stands
    with its current solution. An invalid latest upload (over capacity) counts
    as 0 until the group submits a valid one. `upto` limits to submissions with
    id <= upto, which is how the rank reveal rebuilds the board *before* a
    submission landed without storing snapshots.
    """
    wanted = set(instances)
    users = {u["id"]: u for u in store().users()}
    latest = {}                                 # (key, instance) -> (score, id)
    for s in store().all_submissions():
        if s["instance"] not in wanted or (upto is not None and s["id"] > upto):
            continue
        u = users.get(s["user_id"])
        if u is None or u["grp"] in (None, PROFESSORS):   # no group, professors
            continue
        k = u["id"] if by == "user" else u["grp"]
        cur = latest.get((k, s["instance"]))
        if cur is None or s["id"] > cur[1]:
            latest[(k, s["instance"])] = (s["score"] if s["valid"] else 0, s["id"])

    board = {}
    for (k, inst), (score, sid) in latest.items():
        e = board.setdefault(k, {"total": 0, "scores": {}, "last": 0})
        e["total"] += score
        e["scores"][inst] = score
        e["last"] = max(e["last"], sid)

    out = []
    for k, e in board.items():
        if by == "user":
            u = users[k]
            row = {"key": f"u{k}", "name": u["username"], "group": u["grp"] or "★"}
        else:
            row = {"key": f"g{k}", "name": f"Group {k}", "group": k}
        row.update(total=e["total"], scores=e["scores"], last=e["last"])
        out.append(row)
    # Ties go to whoever settled on their result first.
    out.sort(key=lambda r: (-r["total"], r["last"]))
    for i, r in enumerate(out):
        r["rank"] = i + 1
        del r["last"]
    return out
