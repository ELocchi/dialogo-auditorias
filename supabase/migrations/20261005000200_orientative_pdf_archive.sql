begin;
-- Private server-only archive. Report access is checked with the caller's
-- authenticated RPC before the privileged Storage client reads any document.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('orientative-report-pdfs', 'orientative-report-pdfs', false, 41943040, array['application/pdf'])
on conflict (id) do nothing;
-- No authenticated Storage policies: the web server streams authorized PDFs.
commit;
