-- =====================================================================
-- Sistema da loja · BANCO DE DADOS COMPLETO
-- =====================================================================
-- Para que serve: cria tudo o que o sistema precisa num projeto novo do
-- Supabase (tabelas, login por usuário e senha, regras de quem vê o quê,
-- tempo real e o espaço privado dos comprovantes).
--
-- Como usar:
--   1. Supabase › SQL Editor › New query
--   2. Cole este arquivo inteiro
--   3. No FINAL do arquivo, preencha usuário, nome e senha do administrador
--   4. Clique em Run. Deve aparecer "Success".
-- Pode rodar de novo quantas vezes quiser: nada é apagado nem duplicado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) Extensão de criptografia (usada para guardar as senhas com segurança)
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- 1) PERFIS: quem pode entrar no sistema e com qual papel
-- ---------------------------------------------------------------------
-- usuario        → o nome de usuário digitado no login (ex.: kaique)
-- nome           → nome que aparece no sistema
-- papel          → dono (administrador), tecnico ou vendedor
-- funcionario_id → liga o login ao cadastro de funcionário (comissões e metas)
-- user_id        → a conta de login correspondente (Supabase Auth)
-- ativo          → false = bloqueado (não entra e não vê nada)
create table if not exists public.perfis (
  usuario        text primary key,
  nome           text not null,
  papel          text not null check (papel in ('dono','tecnico','vendedor')),
  funcionario_id text,
  user_id        uuid unique,
  ativo          boolean not null default true,
  criado         timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2) REGISTROS: todos os dados do sistema numa tabela só
-- ---------------------------------------------------------------------
-- Cada OS, venda, cliente, aparelho, gasto etc. é UMA linha:
--   colecao → o tipo (os, vendas, clientes, iphones, gastos, ...)
--   id      → o identificador do item
--   dados   → o item completo, em JSON
-- Coleções usadas pelo sistema:
--   config (id "loja": dados da empresa e logo) · seq (numeração de OS/vendas/notas)
--   clientes · iphones (aparelhos à venda) · procedencias (de quem veio cada aparelho)
--   acessorios · movs (entradas/saídas de acessórios) · os · vendas · notas
--   funcionarios · metas · gastos · pagamentosCom · comPagas
create table if not exists public.registros (
  colecao        text not null,
  id             text not null,
  dados          jsonb not null,
  atualizado     timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),          -- quem fez a última alteração
  primary key (colecao, id)
);


-- ---------------------------------------------------------------------
-- 3) meu_papel(): devolve o papel de quem está logado (ou nada se bloqueado)
-- ---------------------------------------------------------------------
-- Todas as regras de acesso abaixo usam esta função.
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where user_id = auth.uid() and ativo
$$;


-- ---------------------------------------------------------------------
-- 4) Remove o antigo "Primeiro acesso" (versões anteriores do sistema)
-- ---------------------------------------------------------------------
drop trigger if exists liga_usuario on auth.users;
drop function if exists public.liga_usuario();
drop function if exists public.liberar_senha(text);


-- ---------------------------------------------------------------------
-- 5) _criar_conta(): cria a conta de login com usuário e senha (sem e-mail)
-- ---------------------------------------------------------------------
-- Uso interno. O usuário vira "usuario@loja.app" dentro do Supabase
-- Auth (ninguém recebe e-mail; a conta já nasce confirmada).
-- A senha é guardada criptografada (bcrypt), nunca em texto.
create or replace function public._criar_conta(u text, n text, p text, f text, senha text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := gen_random_uuid(); em text;
begin
  u := lower(trim(u));
  if u !~ '^[a-z0-9._-]{2,30}$' then raise exception 'Usuário inválido: use só letras minúsculas e números, sem espaço.'; end if;
  if length(coalesce(senha,'')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  em := u || '@loja.app';
  delete from auth.users where email = em;           -- limpa sobra de tentativa antiga
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
      crypt(senha, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('usuario', u), now(), now(),
      '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  insert into public.perfis (usuario, nome, papel, funcionario_id, user_id, ativo)
    values (u, n, p, nullif(f,''), uid, true)
    on conflict (usuario) do update set nome = excluded.nome, papel = excluded.papel,
      funcionario_id = excluded.funcionario_id, user_id = excluded.user_id, ativo = true;
end $$;
-- ninguém de fora pode chamar esta função diretamente
revoke all on function public._criar_conta(text,text,text,text,text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6) Funções que o sistema chama (tela Funcionários › Usuários do sistema)
-- ---------------------------------------------------------------------
-- criar_usuario: só o administrador; cria técnico ou vendedor
create or replace function public.criar_usuario(u text, n text, p text, f text, senha text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.meu_papel() is distinct from 'dono' then raise exception 'Só o administrador pode criar usuários.'; end if;
  if p not in ('tecnico','vendedor') then raise exception 'Função inválida.'; end if;
  if exists (select 1 from public.perfis where usuario = lower(trim(u))) then raise exception 'Esse usuário já existe.'; end if;
  perform public._criar_conta(u, n, p, f, senha);
end $$;

-- trocar_senha: o administrador troca a de qualquer um; cada um troca a própria
create or replace function public.trocar_senha(u text, senha text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare alvo uuid;
begin
  select user_id into alvo from public.perfis where usuario = lower(trim(u));
  if alvo is null then raise exception 'Usuário não encontrado.'; end if;
  if public.meu_papel() is distinct from 'dono' and alvo is distinct from auth.uid() then raise exception 'Você só pode trocar a sua própria senha.'; end if;
  if length(coalesce(senha,'')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = crypt(senha, gen_salt('bf')), updated_at = now() where id = alvo;
end $$;

-- apagar_usuario: só o administrador; não apaga a si mesmo.
-- O que a pessoa lançou no sistema continua salvo.
create or replace function public.apagar_usuario(u text) returns void
language plpgsql security definer set search_path = public as $$
declare alvo uuid;
begin
  if public.meu_papel() is distinct from 'dono' then raise exception 'Só o administrador pode apagar usuários.'; end if;
  select user_id into alvo from public.perfis where usuario = lower(trim(u));
  if alvo = auth.uid() then raise exception 'Você não pode apagar o seu próprio usuário.'; end if;
  delete from public.perfis where usuario = lower(trim(u));
  if alvo is not null then delete from auth.users where id = alvo; end if;
end $$;


-- ---------------------------------------------------------------------
-- 7) REGRAS DE ACESSO (Row Level Security)
-- ---------------------------------------------------------------------
-- Valem dentro do banco: mesmo quem tentar por fora do sistema não passa.
alter table public.perfis    enable row level security;
alter table public.registros enable row level security;

-- Perfis: todos logados veem a lista (nomes e papéis); só o dono altera (bloquear)
drop policy if exists perfis_ler  on public.perfis;
drop policy if exists perfis_dono on public.perfis;
create policy perfis_ler  on public.perfis for select to authenticated using (true);
create policy perfis_dono on public.perfis for update to authenticated
  using (public.meu_papel() = 'dono') with check (public.meu_papel() = 'dono');

drop policy if exists reg_ler     on public.registros;
drop policy if exists reg_criar   on public.registros;
drop policy if exists reg_alterar on public.registros;
drop policy if exists reg_apagar  on public.registros;

-- LER:
--  · dono vê tudo
--  · demais veem tudo, menos procedência dos aparelhos e gastos
--  · vendedora vê gastos, menos "Compra de aparelho" (que revela a procedência)
create policy reg_ler on public.registros for select to authenticated using (
  public.meu_papel() = 'dono'
  or (public.meu_papel() is not null and colecao not in ('procedencias','gastos'))
  or (public.meu_papel() = 'vendedor' and colecao = 'gastos'
      and coalesce(dados->>'categoria','') <> 'Compra de aparelho')
);

-- CRIAR: todos podem lançar, menos dados da loja, equipe, metas e pagamentos de comissão
-- (técnico e vendedora podem CRIAR procedência e gasto, mas não leem depois)
create policy reg_criar on public.registros for insert to authenticated with check (
  public.meu_papel() = 'dono'
  or (public.meu_papel() is not null and colecao not in ('config','funcionarios','metas','comPagas','pagamentosCom'))
);

-- ALTERAR: como criar, mas procedência e gastos só o dono altera
-- (exceção: a vendedora corrige gastos comuns)
create policy reg_alterar on public.registros for update to authenticated
  using (
    public.meu_papel() = 'dono'
    or (public.meu_papel() is not null and colecao not in ('config','funcionarios','metas','comPagas','pagamentosCom','procedencias','gastos'))
    or (public.meu_papel() = 'vendedor' and colecao = 'gastos' and coalesce(dados->>'categoria','') <> 'Compra de aparelho')
  )
  with check (
    public.meu_papel() = 'dono'
    or (public.meu_papel() is not null and colecao not in ('config','funcionarios','metas','comPagas','pagamentosCom','procedencias','gastos'))
    or (public.meu_papel() = 'vendedor' and colecao = 'gastos' and coalesce(dados->>'categoria','') <> 'Compra de aparelho')
  );

-- APAGAR: só o dono
create policy reg_apagar on public.registros for delete to authenticated using (public.meu_papel() = 'dono');


-- ---------------------------------------------------------------------
-- 8) TEMPO REAL: o que um salva aparece na tela dos outros em segundos
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.registros;
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 9) COMPROVANTES: espaço privado para fotos e PDFs dos gastos
-- ---------------------------------------------------------------------
-- Até 8 MB por arquivo; só JPG, PNG, WebP e PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

-- dono e vendedora veem e enviam; só o dono apaga
drop policy if exists comprovantes_ler     on storage.objects;
drop policy if exists comprovantes_enviar  on storage.objects;
drop policy if exists comprovantes_apagar  on storage.objects;
create policy comprovantes_ler on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and public.meu_papel() in ('dono','vendedor'));
create policy comprovantes_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and public.meu_papel() in ('dono','vendedor'));
create policy comprovantes_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and public.meu_papel() = 'dono');


-- ---------------------------------------------------------------------
-- 10) ADMINISTRADOR: quem vai cuidar do sistema
-- ---------------------------------------------------------------------
-- PREENCHA as 3 linhas abaixo antes de clicar em Run:
--   usuario → uma palavra, minúscula, sem espaço nem acento (ex.: joao)
--   nome    → o nome que aparece no sistema (ex.: João Silva)
--   senha   → mínimo 6 caracteres
-- Se o usuário já existir, a senha é redefinida para esta.
-- Os demais usuários são criados DENTRO do sistema, em
-- Funcionários › Usuários do sistema › Novo usuário.
do $$
declare
  usuario text := 'TROQUE_AQUI';
  nome    text := 'TROQUE_AQUI';
  senha   text := 'TROQUE_AQUI';
begin
  if 'TROQUE_AQUI' in (usuario, nome, senha) then
    raise exception 'Preencha usuário, nome e senha do administrador (no fim do texto) antes de clicar em Run.';
  end if;
  perform public._criar_conta(usuario, nome, 'dono', 'f0', senha);
end $$;
