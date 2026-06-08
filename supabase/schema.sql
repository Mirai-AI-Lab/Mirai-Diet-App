-- Supabase の SQL Editor で実行してください

-- 食事記録
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  image text,
  timing text not null,
  memo text,
  score integer,
  score_comment text,
  eating_order text,
  created_at timestamptz default now()
);

-- 体組成記録
create table if not exists body_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  weight numeric not null,
  body_fat numeric,
  muscle numeric,
  created_at timestamptz default now()
);

-- 運動記録
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  activity text not null default 'カーブス',
  created_at timestamptz default now()
);

alter table meals enable row level security;
alter table body_stats enable row level security;
alter table workouts enable row level security;

create policy "meals: own data only"
  on meals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "body_stats: own data only"
  on body_stats for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "workouts: own data only"
  on workouts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
