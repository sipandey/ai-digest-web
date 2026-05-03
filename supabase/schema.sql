create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  clerk_id      text unique not null,
  email         text not null,
  notion_token  text,
  notion_page_id text,
  topics        text[] default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index on users (clerk_id);
