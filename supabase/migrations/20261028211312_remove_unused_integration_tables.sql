-- These legacy tables may not exist in a fresh project.
drop table if exists public.documents;
drop table if exists public.n8n_chat_histories;
notify pgrst, 'reload schema';
