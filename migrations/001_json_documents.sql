CREATE TABLE IF NOT EXISTS strefa_documents (
  doc_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strefa_documents_updated_at_idx
  ON strefa_documents (updated_at);
