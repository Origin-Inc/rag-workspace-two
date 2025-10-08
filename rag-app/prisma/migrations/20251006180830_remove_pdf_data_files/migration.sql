-- Remove all PDF files from data_files table
-- PDFs are no longer supported after Phase 0 of codebase consolidation

DELETE FROM data_files
WHERE filename LIKE '%.pdf';
