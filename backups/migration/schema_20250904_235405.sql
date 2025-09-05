--
-- PostgreSQL database dump
--

\restrict RWiocBEq0V1b2dTl61Z0ELDOIXeB2OQBTRfNnlgvKKT10OLjTgzopNYl9ruHRy1

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.6 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
begin
    raise debug 'PgBouncer auth request: %', p_usename;

    return query
    select 
        rolname::text, 
        case when rolvaliduntil < now() 
            then null 
            else rolpassword::text 
        end 
    from pg_authid 
    where rolname=$1 and rolcanlogin;
end;
$_$;


--
-- Name: search_embeddings(extensions.vector, uuid, uuid, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_embeddings(query_embedding extensions.vector, workspace_uuid uuid, page_uuid uuid DEFAULT NULL::uuid, result_limit integer DEFAULT 10, similarity_threshold double precision DEFAULT 0.5) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision, source_type text, source_id uuid)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    WITH all_embeddings AS (
        -- Page embeddings
        SELECT 
            pe.id,
            pe.chunk_text as content,
            pe.metadata,
            1 - (pe.embedding <=> query_embedding) as similarity,
            'page'::text as source_type,
            pe.page_id as source_id
        FROM page_embeddings pe
        WHERE pe.workspace_id = workspace_uuid
            AND (page_uuid IS NULL OR pe.page_id = page_uuid)
            AND pe.embedding IS NOT NULL
        
        UNION ALL
        
        -- Block embeddings
        SELECT 
            be.id,
            be.chunk_text as content,
            be.metadata,
            1 - (be.embedding <=> query_embedding) as similarity,
            'block'::text as source_type,
            be.block_id as source_id
        FROM block_embeddings be
        WHERE be.workspace_id = workspace_uuid
            AND (page_uuid IS NULL OR be.page_id = page_uuid)
            AND be.embedding IS NOT NULL
        
        UNION ALL
        
        -- Database row embeddings  
        SELECT 
            dre.id,
            COALESCE(dre.content, dre.chunk_text) as content,
            dre.metadata,
            1 - (dre.embedding <=> query_embedding) as similarity,
            'database_row'::text as source_type,
            dre.row_id as source_id
        FROM database_row_embeddings dre
        WHERE dre.workspace_id = workspace_uuid
            AND dre.embedding IS NOT NULL
    )
    SELECT 
        all_embeddings.id,
        all_embeddings.content,
        all_embeddings.metadata,
        all_embeddings.similarity,
        all_embeddings.source_type,
        all_embeddings.source_id
    FROM all_embeddings
    WHERE all_embeddings.similarity >= similarity_threshold
    ORDER BY all_embeddings.similarity DESC
    LIMIT result_limit;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    resource character varying(100) NOT NULL,
    resource_id character varying(255),
    details jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: block_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.block_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id uuid NOT NULL,
    page_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    chunk_text text NOT NULL,
    chunk_index integer NOT NULL,
    metadata jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    embedding extensions.vector(1536)
);


--
-- Name: database_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_id uuid,
    name character varying(255) NOT NULL,
    description text,
    view_type character varying(50) DEFAULT 'table'::character varying NOT NULL,
    settings jsonb,
    metadata jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: database_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    database_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    width integer DEFAULT 200 NOT NULL,
    "position" integer NOT NULL,
    config jsonb,
    is_visible boolean DEFAULT true NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: database_row_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_row_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    row_id uuid NOT NULL,
    page_id uuid,
    workspace_id uuid NOT NULL,
    chunk_text text NOT NULL,
    metadata jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    embedding extensions.vector(1536),
    content text
);


--
-- Name: database_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    database_id uuid NOT NULL,
    cells jsonb NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    content text,
    file_path character varying(500),
    file_type character varying(50),
    metadata jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    chunk_text text NOT NULL,
    chunk_index integer NOT NULL,
    metadata jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    embedding extensions.vector(1536)
);


--
-- Name: indexing_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indexing_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    operation character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    priority integer DEFAULT 5 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at timestamp(6) with time zone,
    worker_id character varying(100)
);


--
-- Name: integration_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    provider character varying(50) NOT NULL,
    access_token text,
    refresh_token text,
    token_expiry timestamp(6) with time zone,
    metadata jsonb,
    is_active boolean DEFAULT true NOT NULL,
    last_synced_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    workspace_id uuid NOT NULL,
    role_id uuid NOT NULL,
    invited_by_id uuid NOT NULL,
    token character varying(500) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    accepted_at timestamp(6) with time zone,
    expires_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: page_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    chunk_text text NOT NULL,
    chunk_index integer NOT NULL,
    metadata jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    embedding extensions.vector(1536)
);


--
-- Name: pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    workspace_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    slug character varying(500) NOT NULL,
    content jsonb,
    blocks jsonb,
    icon character varying(100),
    cover_image text,
    metadata jsonb,
    parent_id uuid,
    "position" integer DEFAULT 0 NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource character varying(100) NOT NULL,
    action character varying(100) NOT NULL,
    description text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    icon character varying(100),
    color character varying(7),
    settings jsonb,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: queries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    query_text text NOT NULL,
    response_text text,
    context_used jsonb,
    model_used character varying(100),
    tokens_used integer,
    response_time_ms integer,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: query_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.query_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id uuid NOT NULL,
    query text NOT NULL,
    parsed_query jsonb NOT NULL,
    success boolean NOT NULL,
    error text,
    executed_at timestamp(6) with time zone NOT NULL,
    execution_time integer,
    rows_returned integer,
    cached boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(500) NOT NULL,
    family character varying(255) NOT NULL,
    browser_info text,
    expires_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    replaced_by character varying(500),
    replaced_at timestamp(6) with time zone,
    revoked_at timestamp(6) with time zone
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(500) NOT NULL,
    ip_address character varying(45),
    user_agent text,
    expires_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: unified_embeddings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.unified_embeddings AS
 SELECT 'page'::text AS source_type,
    (pe.id)::text AS entity_id,
    pe.page_id,
    pe.workspace_id,
    pe.chunk_text,
    pe.chunk_index,
    pe.embedding,
    pe.metadata,
    pe.created_at,
    pe.updated_at,
    'page'::text AS entity_type,
    (pe.id)::text AS id
   FROM public.page_embeddings pe
  WHERE (pe.embedding IS NOT NULL)
UNION ALL
 SELECT 'block'::text AS source_type,
    (be.id)::text AS entity_id,
    be.page_id,
    be.workspace_id,
    be.chunk_text,
    be.chunk_index,
    be.embedding,
    be.metadata,
    be.created_at,
    be.updated_at,
    'block'::text AS entity_type,
    (be.id)::text AS id
   FROM public.block_embeddings be
  WHERE (be.embedding IS NOT NULL)
UNION ALL
 SELECT 'database_row'::text AS source_type,
    (dre.id)::text AS entity_id,
    dre.page_id,
    dre.workspace_id,
    dre.chunk_text,
    NULL::integer AS chunk_index,
    dre.embedding,
    dre.metadata,
    dre.created_at,
    dre.updated_at,
    'database_row'::text AS entity_type,
    (dre.id)::text AS id
   FROM public.database_row_embeddings dre
  WHERE (dre.embedding IS NOT NULL);


--
-- Name: user_workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    role_id uuid NOT NULL,
    joined_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(255),
    email_verified boolean DEFAULT false NOT NULL,
    email_verification_token character varying(255),
    reset_password_token character varying(255),
    reset_password_expires timestamp(6) with time zone,
    two_factor_secret character varying(255),
    two_factor_enabled boolean DEFAULT false NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    lockout_until timestamp(6) with time zone,
    last_login_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    url text NOT NULL,
    secret text,
    events text[],
    is_active boolean DEFAULT true NOT NULL,
    last_triggered timestamp(6) with time zone,
    failure_count integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    settings jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: block_embeddings block_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_embeddings
    ADD CONSTRAINT block_embeddings_pkey PRIMARY KEY (id);


--
-- Name: database_blocks database_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_blocks
    ADD CONSTRAINT database_blocks_pkey PRIMARY KEY (id);


--
-- Name: database_columns database_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_columns
    ADD CONSTRAINT database_columns_pkey PRIMARY KEY (id);


--
-- Name: database_row_embeddings database_row_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_row_embeddings
    ADD CONSTRAINT database_row_embeddings_pkey PRIMARY KEY (id);


--
-- Name: database_rows database_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_rows
    ADD CONSTRAINT database_rows_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: embeddings embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT embeddings_pkey PRIMARY KEY (id);


--
-- Name: indexing_queue indexing_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indexing_queue
    ADD CONSTRAINT indexing_queue_pkey PRIMARY KEY (id);


--
-- Name: integration_credentials integration_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_credentials
    ADD CONSTRAINT integration_credentials_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: page_embeddings page_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_embeddings
    ADD CONSTRAINT page_embeddings_pkey PRIMARY KEY (id);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: queries queries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queries
    ADD CONSTRAINT queries_pkey PRIMARY KEY (id);


--
-- Name: query_audit_logs query_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.query_audit_logs
    ADD CONSTRAINT query_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: user_workspaces user_workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_workspaces
    ADD CONSTRAINT user_workspaces_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at);


--
-- Name: audit_logs_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_resource_idx ON public.audit_logs USING btree (resource);


--
-- Name: audit_logs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);


--
-- Name: block_embeddings_block_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_embeddings_block_id_idx ON public.block_embeddings USING btree (block_id);


--
-- Name: block_embeddings_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_embeddings_embedding_idx ON public.block_embeddings USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists='100');


--
-- Name: block_embeddings_page_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_embeddings_page_id_idx ON public.block_embeddings USING btree (page_id);


--
-- Name: block_embeddings_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_embeddings_workspace_id_idx ON public.block_embeddings USING btree (workspace_id);


--
-- Name: database_blocks_page_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX database_blocks_page_id_idx ON public.database_blocks USING btree (page_id);


--
-- Name: database_columns_database_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX database_columns_database_id_idx ON public.database_columns USING btree (database_id);


--
-- Name: database_columns_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX database_columns_position_idx ON public.database_columns USING btree ("position");


--
-- Name: database_row_embeddings_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX database_row_embeddings_embedding_idx ON public.database_row_embeddings USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists='100');


--
-- Name: database_row_embeddings_row_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX database_row_embeddings_row_id_idx ON public.database_row_embeddings USING btree (row_id);


--
-- Name: database_row_embeddings_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX database_row_embeddings_workspace_id_idx ON public.database_row_embeddings USING btree (workspace_id);


--
-- Name: database_rows_database_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX database_rows_database_id_idx ON public.database_rows USING btree (database_id);


--
-- Name: database_rows_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX database_rows_position_idx ON public.database_rows USING btree ("position");


--
-- Name: documents_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_user_id_idx ON public.documents USING btree (user_id);


--
-- Name: embeddings_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX embeddings_document_id_idx ON public.embeddings USING btree (document_id);


--
-- Name: embeddings_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX embeddings_embedding_idx ON public.embeddings USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_audit_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_created ON public.audit_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_database_columns_config_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_database_columns_config_gin ON public.database_columns USING gin (config);


--
-- Name: idx_database_columns_database_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_database_columns_database_position ON public.database_columns USING btree (database_id, "position");


--
-- Name: idx_database_rows_cells_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_database_rows_cells_gin ON public.database_rows USING gin (cells);


--
-- Name: idx_database_rows_database_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_database_rows_database_position ON public.database_rows USING btree (database_id, "position");


--
-- Name: idx_indexing_queue_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indexing_queue_entity ON public.indexing_queue USING btree (entity_type, entity_id);


--
-- Name: idx_indexing_queue_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indexing_queue_priority ON public.indexing_queue USING btree (priority, created_at);


--
-- Name: idx_indexing_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indexing_queue_status ON public.indexing_queue USING btree (status);


--
-- Name: idx_indexing_queue_status_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indexing_queue_status_workspace ON public.indexing_queue USING btree (status, workspace_id);


--
-- Name: idx_pages_blocks_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_blocks_gin ON public.pages USING gin (blocks);


--
-- Name: idx_pages_content_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_content_gin ON public.pages USING gin (content);


--
-- Name: idx_pages_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_metadata_gin ON public.pages USING gin (metadata);


--
-- Name: idx_pages_slug_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_slug_workspace ON public.pages USING btree (slug, workspace_id);


--
-- Name: idx_pages_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_title_trgm ON public.pages USING gist (title public.gist_trgm_ops);


--
-- Name: idx_pages_workspace_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_workspace_parent ON public.pages USING btree (workspace_id, parent_id);


--
-- Name: idx_queries_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queries_user_created ON public.queries USING btree (user_id, created_at DESC);


--
-- Name: idx_user_workspaces_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_workspaces_composite ON public.user_workspaces USING btree (user_id, workspace_id);


--
-- Name: idx_workspaces_settings_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workspaces_settings_gin ON public.workspaces USING gin (settings);


--
-- Name: indexing_queue_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX indexing_queue_created_at_idx ON public.indexing_queue USING btree (created_at);


--
-- Name: indexing_queue_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX indexing_queue_workspace_id_idx ON public.indexing_queue USING btree (workspace_id);


--
-- Name: integration_credentials_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_credentials_provider_idx ON public.integration_credentials USING btree (provider);


--
-- Name: integration_credentials_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_credentials_workspace_id_idx ON public.integration_credentials USING btree (workspace_id);


--
-- Name: integration_credentials_workspace_id_provider_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integration_credentials_workspace_id_provider_key ON public.integration_credentials USING btree (workspace_id, provider);


--
-- Name: invitations_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_email_idx ON public.invitations USING btree (email);


--
-- Name: invitations_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_expires_at_idx ON public.invitations USING btree (expires_at);


--
-- Name: invitations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_status_idx ON public.invitations USING btree (status);


--
-- Name: invitations_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_token_idx ON public.invitations USING btree (token);


--
-- Name: invitations_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invitations_token_key ON public.invitations USING btree (token);


--
-- Name: invitations_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_workspace_id_idx ON public.invitations USING btree (workspace_id);


--
-- Name: page_embeddings_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_embeddings_embedding_idx ON public.page_embeddings USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists='100');


--
-- Name: page_embeddings_page_id_chunk_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_embeddings_page_id_chunk_index_idx ON public.page_embeddings USING btree (page_id, chunk_index);


--
-- Name: page_embeddings_page_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_embeddings_page_id_idx ON public.page_embeddings USING btree (page_id);


--
-- Name: page_embeddings_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_embeddings_workspace_id_idx ON public.page_embeddings USING btree (workspace_id);


--
-- Name: pages_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pages_parent_id_idx ON public.pages USING btree (parent_id);


--
-- Name: pages_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pages_position_idx ON public.pages USING btree ("position");


--
-- Name: pages_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pages_project_id_idx ON public.pages USING btree (project_id);


--
-- Name: pages_project_id_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pages_project_id_slug_key ON public.pages USING btree (project_id, slug);


--
-- Name: pages_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pages_workspace_id_idx ON public.pages USING btree (workspace_id);


--
-- Name: pages_workspace_id_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pages_workspace_id_parent_id_idx ON public.pages USING btree (workspace_id, parent_id);


--
-- Name: pages_workspace_id_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pages_workspace_id_slug_key ON public.pages USING btree (workspace_id, slug);


--
-- Name: permissions_resource_action_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissions_resource_action_key ON public.permissions USING btree (resource, action);


--
-- Name: permissions_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permissions_resource_idx ON public.permissions USING btree (resource);


--
-- Name: projects_is_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_is_archived_idx ON public.projects USING btree (is_archived);


--
-- Name: projects_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_workspace_id_idx ON public.projects USING btree (workspace_id);


--
-- Name: projects_workspace_id_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX projects_workspace_id_slug_key ON public.projects USING btree (workspace_id, slug);


--
-- Name: queries_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX queries_user_id_idx ON public.queries USING btree (user_id);


--
-- Name: query_audit_logs_block_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX query_audit_logs_block_id_idx ON public.query_audit_logs USING btree (block_id);


--
-- Name: query_audit_logs_executed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX query_audit_logs_executed_at_idx ON public.query_audit_logs USING btree (executed_at);


--
-- Name: query_audit_logs_success_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX query_audit_logs_success_idx ON public.query_audit_logs USING btree (success);


--
-- Name: refresh_tokens_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_family_idx ON public.refresh_tokens USING btree (family);


--
-- Name: refresh_tokens_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_token_idx ON public.refresh_tokens USING btree (token);


--
-- Name: refresh_tokens_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX refresh_tokens_token_key ON public.refresh_tokens USING btree (token);


--
-- Name: refresh_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_user_id_idx ON public.refresh_tokens USING btree (user_id);


--
-- Name: role_permissions_role_id_permission_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_permissions_role_id_permission_id_key ON public.role_permissions USING btree (role_id, permission_id);


--
-- Name: roles_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_token_idx ON public.sessions USING btree (token);


--
-- Name: sessions_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_token_key ON public.sessions USING btree (token);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: user_workspaces_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_workspaces_user_id_idx ON public.user_workspaces USING btree (user_id);


--
-- Name: user_workspaces_user_id_workspace_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_workspaces_user_id_workspace_id_key ON public.user_workspaces USING btree (user_id, workspace_id);


--
-- Name: user_workspaces_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_workspaces_workspace_id_idx ON public.user_workspaces USING btree (workspace_id);


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_email_verification_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_verification_token_idx ON public.users USING btree (email_verification_token);


--
-- Name: users_email_verification_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_verification_token_key ON public.users USING btree (email_verification_token);


--
-- Name: users_reset_password_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_reset_password_token_idx ON public.users USING btree (reset_password_token);


--
-- Name: users_reset_password_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_reset_password_token_key ON public.users USING btree (reset_password_token);


--
-- Name: webhooks_integration_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhooks_integration_id_idx ON public.webhooks USING btree (integration_id);


--
-- Name: webhooks_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhooks_is_active_idx ON public.webhooks USING btree (is_active);


--
-- Name: workspaces_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_slug_idx ON public.workspaces USING btree (slug);


--
-- Name: workspaces_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspaces_slug_key ON public.workspaces USING btree (slug);


--
-- Name: block_embeddings update_block_embeddings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_block_embeddings_updated_at BEFORE UPDATE ON public.block_embeddings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: database_blocks update_database_blocks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_database_blocks_updated_at BEFORE UPDATE ON public.database_blocks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: database_columns update_database_columns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_database_columns_updated_at BEFORE UPDATE ON public.database_columns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: database_row_embeddings update_database_row_embeddings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_database_row_embeddings_updated_at BEFORE UPDATE ON public.database_row_embeddings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: database_rows update_database_rows_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_database_rows_updated_at BEFORE UPDATE ON public.database_rows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: documents update_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: indexing_queue update_indexing_queue_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_indexing_queue_updated_at BEFORE UPDATE ON public.indexing_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: integration_credentials update_integration_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_integration_credentials_updated_at BEFORE UPDATE ON public.integration_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: page_embeddings update_page_embeddings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_page_embeddings_updated_at BEFORE UPDATE ON public.page_embeddings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pages update_pages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: roles update_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: webhooks update_webhooks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workspaces update_workspaces_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: block_embeddings block_embeddings_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_embeddings
    ADD CONSTRAINT block_embeddings_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.pages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: block_embeddings block_embeddings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_embeddings
    ADD CONSTRAINT block_embeddings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: database_columns database_columns_database_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_columns
    ADD CONSTRAINT database_columns_database_id_fkey FOREIGN KEY (database_id) REFERENCES public.database_blocks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: database_row_embeddings database_row_embeddings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_row_embeddings
    ADD CONSTRAINT database_row_embeddings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: database_rows database_rows_database_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_rows
    ADD CONSTRAINT database_rows_database_id_fkey FOREIGN KEY (database_id) REFERENCES public.database_blocks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: embeddings embeddings_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT embeddings_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: indexing_queue indexing_queue_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indexing_queue
    ADD CONSTRAINT indexing_queue_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: integration_credentials integration_credentials_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_credentials
    ADD CONSTRAINT integration_credentials_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invitations invitations_invited_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_by_id_fkey FOREIGN KEY (invited_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invitations invitations_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invitations invitations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: page_embeddings page_embeddings_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_embeddings
    ADD CONSTRAINT page_embeddings_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.pages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: page_embeddings page_embeddings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_embeddings
    ADD CONSTRAINT page_embeddings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pages pages_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.pages(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pages pages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pages pages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: projects projects_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: queries queries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queries
    ADD CONSTRAINT queries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: query_audit_logs query_audit_logs_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.query_audit_logs
    ADD CONSTRAINT query_audit_logs_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.database_blocks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_workspaces user_workspaces_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_workspaces
    ADD CONSTRAINT user_workspaces_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_workspaces user_workspaces_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_workspaces
    ADD CONSTRAINT user_workspaces_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_workspaces user_workspaces_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_workspaces
    ADD CONSTRAINT user_workspaces_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: webhooks webhooks_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integration_credentials(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict RWiocBEq0V1b2dTl61Z0ELDOIXeB2OQBTRfNnlgvKKT10OLjTgzopNYl9ruHRy1

