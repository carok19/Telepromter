-- ============================================================
-- Control remoto (F8) sobre Supabase — registro de lo ejecutado en el
-- SQL Editor del proyecto Supabase. Este archivo es SOLO DOCUMENTACIÓN:
-- no se corre automáticamente en ningún build/deploy. Ya fue ejecutado
-- manualmente contra el proyecto real y verificado sin errores.
--
-- Diseño de seguridad (por qué está armado así):
--   - La tabla remote_sessions NO se toca nunca directamente desde el
--     cliente: RLS habilitado y SIN políticas la bloquea por completo
--     (select/insert/update/delete deniegan para cualquier rol), y además
--     se revocan explícitamente los permisos por defecto que Supabase
--     otorga a "anon"/"authenticated" sobre tablas nuevas de "public".
--   - El único acceso es a través de 4 funciones SQL con
--     SECURITY DEFINER y search_path fijo en '' (para que no puedan ser
--     engañadas por objetos con el mismo nombre creados en otro esquema),
--     con GRANT EXECUTE otorgado explícitamente solo a "anon" (se revoca
--     primero de PUBLIC, que es a quien Postgres le da EXECUTE por
--     defecto en funciones nuevas).
--   - host_token es el secreto que demuestra que un cliente es el host de
--     una sesión: lo genera el servidor al crear la sesión, se devuelve
--     una única vez a quien la creó, y nunca se expone en
--     get_remote_session ni viaja en el QR/enlace que ve el remoto.
--   - join_remote_session hace un UPDATE atómico
--     (WHERE remote_client_id IS NULL OR remote_client_id = p_client_id)
--     para que, si dos remotos escanean el mismo QR casi al mismo tiempo,
--     Postgres garantice que solo uno se queda con el cupo — sin esto se
--     repetiría el mismo tipo de condición de carrera que ya se encontró
--     (y corrigió) dos veces trabajando con Firebase.
--
-- Nota de la verificación real (ejecutada contra el proyecto): "anon"
-- tiene EXECUTE en las 4 funciones como se buscaba. Además aparecen
-- "authenticated", "postgres" y "service_role" con EXECUTE — son
-- privilegios por defecto de Supabase (el dueño/roles administrativos
-- siempre pueden ejecutar lo que crean) y no representan un problema: la
-- app nunca se autentica como esos roles, siempre usa la publishable key
-- (rol "anon"). "PUBLIC" no aparece, que es lo que importaba revisar.
-- ============================================================


-- ============================================================
-- BLOQUE 1 — Configuración (tabla, RLS sin políticas, revocar permisos,
-- las 4 funciones, y los GRANT explícitos). Seguro de volver a ejecutar.
-- ============================================================

-- 1) TABLA — sin acceso directo desde el cliente
create table if not exists public.remote_sessions (
  id                text primary key,
  host_token        text not null,
  script_title      text not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  remote_client_id  text,
  ended_at          timestamptz
);

-- RLS habilitado y SIN políticas -> cualquier select/insert/update/delete
-- directo contra la tabla (vía la API REST automática de Supabase) queda
-- denegado por completo, para cualquier rol.
alter table public.remote_sessions enable row level security;

-- Los proyectos nuevos de Supabase otorgan por defecto SELECT/INSERT/
-- UPDATE/DELETE sobre las tablas de "public" a los roles anon y
-- authenticated (privilegios por defecto configurados al crear el
-- proyecto). RLS sin políticas ya bloquea el acceso igual, pero se revoca
-- también el permiso de la tabla en sí como segunda barrera explícita.
revoke all on public.remote_sessions from anon, authenticated;

-- 2) FUNCIONES — el único camino de acceso, cada una con su propia
--    validación. SECURITY DEFINER + search_path fijo en '' (vacío) para
--    que no puedan ser engañadas por objetos con el mismo nombre creados
--    en otro esquema; por eso la tabla se referencia siempre como
--    "public.remote_sessions", nunca sin el prefijo.

-- Crea una sesión nueva. Devuelve el id (va en el QR) y el host_token
-- (se queda SOLO en el dispositivo host, nunca se manda al remoto).
create or replace function public.create_remote_session(p_title text)
returns table (id text, host_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := gen_random_uuid()::text;
  v_host_token text := gen_random_uuid()::text;
begin
  insert into public.remote_sessions (id, host_token, script_title, expires_at)
  values (
    v_id,
    v_host_token,
    left(coalesce(nullif(trim(p_title), ''), 'Sin título'), 200),
    now() + interval '2 hours'
  );

  return query select v_id, v_host_token;
end;
$$;

-- Lee el estado de una sesión. Nunca incluye host_token.
create or replace function public.get_remote_session(p_id text)
returns table (
  id text,
  script_title text,
  created_at timestamptz,
  expires_at timestamptz,
  remote_client_id text,
  ended_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select s.id, s.script_title, s.created_at, s.expires_at, s.remote_client_id, s.ended_at
  from public.remote_sessions s
  where s.id = p_id;
$$;

-- Intenta unirse como remoto. UPDATE atómico: solo escribe si el cupo
-- está libre (remote_client_id IS NULL) o ya es este mismo cliente
-- (recargó la página), y solo si la sesión no terminó ni expiró. Devuelve
-- el estado actual de la fila para que el código decida el motivo exacto
-- si no pudo unirse (no existe / terminada / expirada / ocupada por otro).
create or replace function public.join_remote_session(p_id text, p_client_id text)
returns table (
  id text,
  script_title text,
  created_at timestamptz,
  expires_at timestamptz,
  remote_client_id text,
  ended_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.remote_sessions
  set remote_client_id = p_client_id
  where public.remote_sessions.id = p_id
    and public.remote_sessions.ended_at is null
    and public.remote_sessions.expires_at > now()
    and (
      public.remote_sessions.remote_client_id is null
      or public.remote_sessions.remote_client_id = p_client_id
    );

  return query
  select s.id, s.script_title, s.created_at, s.expires_at, s.remote_client_id, s.ended_at
  from public.remote_sessions s
  where s.id = p_id;
end;
$$;

-- Cierra la sesión, pero solo si el host_token coincide (es decir, solo el
-- dispositivo que la creó puede cerrarla). Si el token no coincide, no
-- hace nada — no informa si el id existe o no, para no dar pistas.
create or replace function public.end_remote_session(p_id text, p_host_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.remote_sessions
  set ended_at = now()
  where public.remote_sessions.id = p_id
    and public.remote_sessions.host_token = p_host_token
    and public.remote_sessions.ended_at is null;
end;
$$;

-- 3) PERMISOS DE LAS FUNCIONES — por defecto Postgres otorga EXECUTE a
--    PUBLIC (es decir, a todos los roles) en funciones nuevas, al revés
--    de lo que pasa con las tablas. Por eso primero se revoca de PUBLIC y
--    recién después se concede puntualmente solo a "anon".
revoke all on function public.create_remote_session(text) from public;
revoke all on function public.get_remote_session(text) from public;
revoke all on function public.join_remote_session(text, text) from public;
revoke all on function public.end_remote_session(text, text) from public;

grant execute on function public.create_remote_session(text) to anon;
grant execute on function public.get_remote_session(text) to anon;
grant execute on function public.join_remote_session(text, text) to anon;
grant execute on function public.end_remote_session(text, text) to anon;


-- ============================================================
-- BLOQUE 2 — Verificación (ejecutada una vez, sin errores). Crea y borra
-- su propia fila de prueba; corta con un error rojo explícito si algo no
-- es lo esperado.
-- ============================================================

-- Chequeos estructurales
select relrowsecurity as rls_habilitado
from pg_class where oid = 'public.remote_sessions'::regclass;
-- Debe dar TRUE

select count(*) as politicas_existentes
from pg_policies
where schemaname = 'public' and tablename = 'remote_sessions';
-- Debe dar 0

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'remote_sessions'
  and grantee in ('anon', 'authenticated');
-- Debe devolver 0 filas (sin permisos directos sobre la tabla)

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('create_remote_session','get_remote_session','join_remote_session','end_remote_session')
order by routine_name, grantee;
-- "anon" debe tener EXECUTE en las 4. "authenticated"/"postgres"/
-- "service_role" también pueden aparecer (privilegios por defecto de
-- Supabase para roles administrativos) — la app nunca actúa como esos
-- roles. "PUBLIC" NO debe aparecer.

-- Prueba funcional de punta a punta (crea y borra su propia fila de prueba)
do $$
declare
  v_id text;
  v_host_token text;
  v_row record;
begin
  select id, host_token into v_id, v_host_token from public.create_remote_session('Prueba de verificación');
  raise notice 'Sesion creada: id=%, host_token=%', v_id, v_host_token;

  select * into v_row from public.get_remote_session(v_id);
  raise notice 'get_remote_session -> remote_client_id=%, ended_at=%', v_row.remote_client_id, v_row.ended_at;

  select * into v_row from public.join_remote_session(v_id, 'cliente-prueba-1');
  if v_row.remote_client_id <> 'cliente-prueba-1' then
    raise exception 'FALLO: el primer remoto no pudo unirse';
  end if;
  raise notice 'OK: primer remoto unido (%)', v_row.remote_client_id;

  select * into v_row from public.join_remote_session(v_id, 'cliente-prueba-2');
  if v_row.remote_client_id = 'cliente-prueba-2' then
    raise exception 'FALLO DE SEGURIDAD: un segundo remoto pudo robar el cupo';
  end if;
  raise notice 'OK: segundo remoto rechazado, el cupo sigue en %', v_row.remote_client_id;

  select * into v_row from public.join_remote_session(v_id, 'cliente-prueba-1');
  if v_row.remote_client_id <> 'cliente-prueba-1' then
    raise exception 'FALLO: el mismo remoto no pudo re-unirse (recarga de pagina)';
  end if;
  raise notice 'OK: el mismo remoto puede recargar sin problema';

  perform public.end_remote_session(v_id, 'token-incorrecto');
  select * into v_row from public.get_remote_session(v_id);
  if v_row.ended_at is not null then
    raise exception 'FALLO DE SEGURIDAD: la sesion se cerro con un host_token incorrecto';
  end if;
  raise notice 'OK: un host_token incorrecto no cierra la sesion';

  perform public.end_remote_session(v_id, v_host_token);
  select * into v_row from public.get_remote_session(v_id);
  if v_row.ended_at is null then
    raise exception 'FALLO: el host no pudo cerrar su propia sesion con el token correcto';
  end if;
  raise notice 'OK: el host cerro su sesion correctamente';

  delete from public.remote_sessions where id = v_id;
  raise notice 'TODO CORRECTO — fila de prueba eliminada';
end $$;
