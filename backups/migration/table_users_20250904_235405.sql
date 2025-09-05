--
-- PostgreSQL database dump
--

\restrict JDDhQdVpt1MBX5h3Vv2w4ZSrvIpfKKnzDOunOkyVgmLhh0EIJqCZjTx9M8nJ2bK

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
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.users DISABLE TRIGGER ALL;

COPY public.users (id, email, password_hash, name, email_verified, email_verification_token, reset_password_token, reset_password_expires, two_factor_secret, two_factor_enabled, failed_login_attempts, lockout_until, last_login_at, created_at, updated_at) FROM stdin;
171cea29-a4f4-4ff5-9d96-8e0069067b72	test5@example.com	$2b$12$rJHabWWEIS9tWhtnMMT1p.1ut2hn9YyaVRk1N0dsphyIyw3/M/txC	joey	t	\N	\N	\N	\N	f	0	\N	\N	2025-09-04 07:56:07.879+00	2025-09-04 07:56:07.879+00
99617c18-21db-42f9-8fd9-04af85ab86f4	test6@example.com	$2b$12$03xxtwsOrMY/A3DnU.thZOnOlCdZHChL.R7OKZOb2rN4fy9RuLTpO	Joey	t	\N	\N	\N	\N	f	0	\N	\N	2025-09-04 09:05:09.143+00	2025-09-04 09:05:09.143+00
\.


ALTER TABLE public.users ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict JDDhQdVpt1MBX5h3Vv2w4ZSrvIpfKKnzDOunOkyVgmLhh0EIJqCZjTx9M8nJ2bK

