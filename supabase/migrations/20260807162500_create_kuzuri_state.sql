create table if not exists public.kuzuri_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kuzuri_states enable row level security;

create policy "Users can read their Kuzuri state"
  on public.kuzuri_states
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their Kuzuri state"
  on public.kuzuri_states
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their Kuzuri state"
  on public.kuzuri_states
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their Kuzuri state"
  on public.kuzuri_states
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kuzuri_states_set_updated_at on public.kuzuri_states;

create trigger kuzuri_states_set_updated_at
  before update on public.kuzuri_states
  for each row
  execute function public.set_updated_at();
