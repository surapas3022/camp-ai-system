-- Hosted corpus + runtime schema for Vercel.
-- The service role bypasses RLS. Anon and authenticated have no policies, so the
-- Data API cannot read or write these tables from the browser.

create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists documents (
  id text primary key,
  original_filename text not null,
  stored_filename text not null,
  bytes integer not null,
  sha256 text not null,
  page_count integer not null,
  status text not null check (status in ('processing', 'ready', 'failed')),
  error text,
  created_at timestamptz not null,
  processed_at timestamptz not null
);

create table if not exists document_metadata (
  document_id text primary key references documents(id) on delete cascade,
  access_level text not null check (access_level in ('public', 'staff')),
  title text not null,
  owner text not null,
  audience text not null,
  review_date text not null,
  retention_category text not null,
  tags_json jsonb not null default '[]'::jsonb,
  adversarial_fixture boolean not null default false,
  fixture_type text
);

create table if not exists ingestion_runs (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  chunk_length integer not null,
  chunk_overlap integer not null,
  created_at timestamptz not null
);

create table if not exists chunks (
  id integer primary key,
  document_id text not null references documents(id) on delete cascade,
  ingestion_run_id text not null references ingestion_runs(id) on delete cascade,
  ordinal integer not null,
  page_start integer not null,
  page_end integer not null,
  text text not null,
  token_count integer not null,
  search_text tsvector generated always as (to_tsvector('simple', coalesce(text, ''))) stored
);

create index if not exists chunks_document_id_idx on chunks(document_id, ordinal);
create index if not exists chunks_search_text_idx on chunks using gin(search_text);

create table if not exists chunk_embeddings (
  chunk_id integer primary key references chunks(id) on delete cascade,
  model_id text not null,
  model_revision text not null,
  runtime_model_id text not null,
  runtime_model_revision text not null,
  dimensions integer not null,
  instruction_prefix text not null,
  embedded_at timestamptz not null,
  embedding vector(384)
);

create table if not exists security_chunk_flags (
  chunk_id integer primary key references chunks(id) on delete cascade,
  status text not null check (status = 'quarantined'),
  reason_code text not null,
  detector_version text not null,
  content_fingerprint text not null,
  detected_at timestamptz not null
);

create table if not exists audit_events (
  id text primary key,
  created_at timestamptz not null,
  request_fingerprint text not null,
  answer_fingerprint text,
  role text not null check (role in ('public', 'staff')),
  retrieval_mode text not null check (retrieval_mode in ('keyword', 'semantic')),
  language text not null check (language in ('en', 'th')),
  decision text not null check (decision in ('allow', 'refuse_input', 'refuse_pii', 'no_authorized_evidence', 'unsafe_output')),
  reason_codes_json jsonb not null,
  authorized_chunk_count integer not null,
  citation_chunk_ids_json jsonb not null,
  incident_found boolean not null
);

create index if not exists audit_events_created_at_idx on audit_events(created_at desc);

create table if not exists agent_task_summaries (
  task_id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  role text not null check (role in ('public', 'staff')),
  state text not null check (state in ('planned', 'awaiting_approval', 'completed', 'declined', 'safely_stopped')),
  task_fingerprint text not null,
  evidence_count integer not null,
  draft_version integer,
  approval_json jsonb not null,
  reason_codes_json jsonb not null,
  step_count integer not null
);

create table if not exists agent_trace_events (
  id text primary key,
  task_id text not null,
  created_at timestamptz not null,
  from_state text,
  to_state text not null check (to_state in ('planned', 'awaiting_approval', 'completed', 'declined', 'safely_stopped')),
  tool text check (tool in ('search_knowledge_base', 'create_draft', 'request_approval')),
  outcome text not null check (outcome in ('ok', 'stopped', 'declined')),
  evidence_count integer not null,
  draft_version integer,
  reason_code text,
  step integer not null
);

create index if not exists agent_trace_events_task_id_idx on agent_trace_events(task_id, created_at);

create table if not exists agent_workspaces (
  task_id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  role text not null check (role in ('public', 'staff')),
  idempotency_key text not null,
  approval_used boolean not null default false,
  started_at_ms bigint not null,
  payload jsonb not null,
  unique (role, idempotency_key)
);

create table if not exists operational_events (
  id text primary key,
  created_at timestamptz not null,
  kind text not null check (kind in ('answer', 'agent', 'evaluation', 'feedback')),
  outcome text not null,
  latency_ms integer,
  error_class text not null check (error_class in ('none', 'provider', 'validation', 'internal')),
  citation_count integer not null,
  estimated_cost_usd double precision
);

create index if not exists operational_events_created_at_idx on operational_events(created_at desc);

create table if not exists evaluation_runs (
  id text primary key,
  created_at timestamptz not null,
  dataset_version text not null,
  mode text not null check (mode in ('fixture', 'provider')),
  results_json jsonb not null,
  metrics_json jsonb not null,
  gate_json jsonb not null
);

create index if not exists evaluation_runs_created_at_idx on evaluation_runs(created_at desc);

create table if not exists feedback_events (
  id text primary key,
  created_at timestamptz not null,
  role text not null check (role in ('public', 'staff')),
  kind text not null check (kind in ('quality', 'safety')),
  rating text not null check (rating in ('up', 'down')),
  reason_codes_json jsonb not null,
  surface text not null check (surface in ('answer', 'agent', 'system')),
  payload_fingerprint text not null
);

create index if not exists feedback_events_created_at_idx on feedback_events(created_at desc);

create or replace function match_chunks(
  query_embedding vector(384),
  match_count integer,
  viewer_role text
)
returns table (
  id integer,
  ordinal integer,
  document_id text,
  text text,
  page_start integer,
  page_end integer,
  token_count integer,
  model_id text,
  runtime_model_id text,
  dimensions integer,
  embedded_at timestamptz,
  title text,
  access_level text,
  score double precision
)
language sql
stable
as $$
  select
    c.id, c.ordinal, c.document_id, c.text, c.page_start, c.page_end, c.token_count,
    e.model_id, e.runtime_model_id, e.dimensions, e.embedded_at,
    m.title, m.access_level,
    (e.embedding <=> query_embedding) as score
  from chunk_embeddings e
  join chunks c on c.id = e.chunk_id
  join documents d on d.id = c.document_id
  join document_metadata m on m.document_id = d.id
  where d.status = 'ready'
    and e.embedding is not null
    and (m.access_level = 'public' or viewer_role = 'staff')
    and not exists (
      select 1 from security_chunk_flags sf
      where sf.chunk_id = c.id and sf.status = 'quarantined'
    )
  order by e.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

alter table documents enable row level security;
alter table document_metadata enable row level security;
alter table ingestion_runs enable row level security;
alter table chunks enable row level security;
alter table chunk_embeddings enable row level security;
alter table security_chunk_flags enable row level security;
alter table audit_events enable row level security;
alter table agent_task_summaries enable row level security;
alter table agent_trace_events enable row level security;
alter table agent_workspaces enable row level security;
alter table operational_events enable row level security;
alter table evaluation_runs enable row level security;
alter table feedback_events enable row level security;
