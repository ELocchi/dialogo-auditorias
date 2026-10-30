-- Quality monthly scores from the spreadsheet "Ranking obras - 2026" (column "Nota", Jan-Oct 2026)
-- for the works registered on 30/10/2026: Paseo Santa Cruz (registered as "Paso Santa Cruz"),
-- Vista Tatuapé Boulevard and Oásis Condomínio Clube.
begin;
insert into public.historical_ranking_scores(work_id, modulo, month, score, source) values
  ('0ddcedd7-d02d-4b04-b682-ab2f3a3970d6', 'QUALIDADE', date '2026-01-01', 7.40, 'Planilha Ranking obras - 2026'),
  ('2f0ae166-953e-4bb4-b8a5-55baf7d782f7', 'QUALIDADE', date '2026-01-01', 6.51, 'Planilha Ranking obras - 2026'),
  ('45236448-6fbc-4499-a684-7a290bbc4b90', 'QUALIDADE', date '2026-01-01', 8.16, 'Planilha Ranking obras - 2026'),
  ('0ddcedd7-d02d-4b04-b682-ab2f3a3970d6', 'QUALIDADE', date '2026-02-01', 8.32, 'Planilha Ranking obras - 2026'),
  ('45236448-6fbc-4499-a684-7a290bbc4b90', 'QUALIDADE', date '2026-02-01', 5.21, 'Planilha Ranking obras - 2026'),
  ('0ddcedd7-d02d-4b04-b682-ab2f3a3970d6', 'QUALIDADE', date '2026-03-01', 9.00, 'Planilha Ranking obras - 2026'),
  ('45236448-6fbc-4499-a684-7a290bbc4b90', 'QUALIDADE', date '2026-03-01', 6.00, 'Planilha Ranking obras - 2026'),
  ('0ddcedd7-d02d-4b04-b682-ab2f3a3970d6', 'QUALIDADE', date '2026-04-01', 9.00, 'Planilha Ranking obras - 2026'),
  ('45236448-6fbc-4499-a684-7a290bbc4b90', 'QUALIDADE', date '2026-04-01', 7.79, 'Planilha Ranking obras - 2026'),
  ('0ddcedd7-d02d-4b04-b682-ab2f3a3970d6', 'QUALIDADE', date '2026-05-01', 9.47, 'Planilha Ranking obras - 2026'),
  ('45236448-6fbc-4499-a684-7a290bbc4b90', 'QUALIDADE', date '2026-05-01', 8.50, 'Planilha Ranking obras - 2026'),
  ('0ddcedd7-d02d-4b04-b682-ab2f3a3970d6', 'QUALIDADE', date '2026-06-01', 7.15, 'Planilha Ranking obras - 2026'),
  ('0ddcedd7-d02d-4b04-b682-ab2f3a3970d6', 'QUALIDADE', date '2026-07-01', 9.72, 'Planilha Ranking obras - 2026')
on conflict (work_id, modulo, month) do nothing;
commit;
