--
-- PostgreSQL database dump
--

\restrict mdnusoabXa0g6X2Ot0VkOWiUUDTsvzUXaCS8LsSGBDRwjoLQ6dan6Gz0z6jXy2p

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
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.workspaces DISABLE TRIGGER ALL;

COPY public.workspaces (id, name, slug, description, settings, created_at, updated_at) FROM stdin;
bb39577a-b114-4023-9cf6-88ab71bb4dd5	joey's Workspace	joey-s-workspace-171cea29	\N	\N	2025-09-04 07:56:07.912+00	2025-09-04 07:56:07.912+00
00fb4598-3475-4e09-944d-c0b628bbc061	Joey's Workspace	joey-s-workspace-99617c18	\N	\N	2025-09-04 09:05:09.197+00	2025-09-04 09:05:09.197+00
\.


ALTER TABLE public.workspaces ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict mdnusoabXa0g6X2Ot0VkOWiUUDTsvzUXaCS8LsSGBDRwjoLQ6dan6Gz0z6jXy2p

