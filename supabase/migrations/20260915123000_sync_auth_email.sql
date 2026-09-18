-- Keep the linked VESTORA profile in sync when a signed-in user confirms
-- an email-address change through Supabase Auth.
create or replace function public.vestora_sync_auth_email_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email is distinct from new.email and new.email is not null then
    update public.core_user
    set email = new.email
    where lower(email) = lower(old.email);
  end if;
  return new;
end;
$$;

drop trigger if exists vestora_sync_auth_email_to_profile on auth.users;
create trigger vestora_sync_auth_email_to_profile
  after update of email on auth.users
  for each row
  execute function public.vestora_sync_auth_email_to_profile();
