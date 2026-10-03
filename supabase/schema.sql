-- Class console schema. Run once in the Supabase dashboard: SQL Editor -> New query -> Run.
--
-- The API server talks to these tables with the secret key, which bypasses
-- row-level security. RLS is switched on with no policies, so the publishable
-- (browser) key can read or write nothing here -- password hashes included.

create table if not exists hc_users (
    id          bigint generated always as identity primary key,
    username    text not null,
    grp         text check (grp in ('A','B','C','D','E','F','G','H','J','K','L')),   -- null: the admin
    salt        text not null,
    pw_hash     text not null,
    created     timestamptz not null default now()
);
create unique index if not exists hc_users_username_ci on hc_users (lower(username));
-- Databases created before the admin account existed:
alter table hc_users alter column grp drop not null;

create table if not exists hc_sessions (
    token       text primary key,
    user_id     bigint not null references hc_users(id) on delete cascade,
    created     timestamptz not null default now()
);

create table if not exists hc_submissions (
    id          bigint generated always as identity primary key,
    user_id     bigint not null references hc_users(id) on delete cascade,
    instance    text not null,
    run_id      text not null unique,
    score       bigint not null,
    valid       boolean not null,
    source      text not null,
    created     timestamptz not null default now()
);
create index if not exists hc_submissions_board on hc_submissions (instance, valid);
create index if not exists hc_submissions_user on hc_submissions (user_id);

-- Admin choices shared by every server process, e.g. which data sets count
-- for the final ranking.
create table if not exists hc_settings (
    key         text primary key,
    value       jsonb not null,
    updated     timestamptz not null default now()
);

-- Four seats per group, enforced in the database so two people signing up at
-- the same moment cannot both take the last one. Also guards an admin moving
-- someone into a full group; a person's own row never counts against them.
create or replace function hc_group_cap() returns trigger language plpgsql as $$
begin
    if new.grp is null then          -- the admin holds no seat
        return new;
    end if;
    perform pg_advisory_xact_lock(hashtext('hc_group_' || new.grp));
    if (select count(*) from hc_users where grp = new.grp and id is distinct from new.id) >= 4 then
        raise exception 'group % is full (4 members)', new.grp using errcode = 'P0001';
    end if;
    return new;
end $$;

drop trigger if exists hc_group_cap on hc_users;
create trigger hc_group_cap before insert or update of grp on hc_users
    for each row execute function hc_group_cap();

alter table hc_users enable row level security;
alter table hc_sessions enable row level security;
alter table hc_submissions enable row level security;
alter table hc_settings enable row level security;

-- Accounts live in Supabase Auth: a player row points at its auth user, and a
-- session keeps the Supabase refresh token so logging out revokes it there too.
-- The local password columns are only used by the offline SQLite mode.
alter table hc_users add column if not exists auth_id uuid unique;
alter table hc_users add column if not exists email text;
alter table hc_users alter column salt drop not null;
alter table hc_users alter column pw_hash drop not null;
alter table hc_sessions add column if not exists sb_refresh text;

-- 'P' is the Professor group: admins who do not compete, so it has no seat cap.
alter table hc_users drop constraint if exists hc_users_grp_check;
alter table hc_users add constraint hc_users_grp_check
    check (grp in ('A','B','C','D','E','F','G','H','J','K','L','P'));

create or replace function hc_group_cap() returns trigger language plpgsql as $$
begin
    if new.grp is null or new.grp = 'P' then     -- the admin account, professors: no seats
        return new;
    end if;
    perform pg_advisory_xact_lock(hashtext('hc_group_' || new.grp));
    if (select count(*) from hc_users where grp = new.grp and id is distinct from new.id) >= 4 then
        raise exception 'group % is full (4 members)', new.grp using errcode = 'P0001';
    end if;
    return new;
end $$;

-- Finished runs (event log + analysis), gzipped and base64-encoded. The server
-- keeps a disk copy as a cache, but a host like Heroku wipes its disk on every
-- restart, so this table is what keeps old submissions replayable.
create table if not exists hc_runs (
    id          text primary key,
    instance    text not null,
    data        text not null,
    created     timestamptz not null default now()
);
alter table hc_runs enable row level security;
