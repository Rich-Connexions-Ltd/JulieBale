-- Julie Bale — content backbone (D1)
-- Generic document store + version history + feature requests.
-- Typed tables for events/dates come later when calendar queries need them.

CREATE TABLE IF NOT EXISTS documents (
  collection  TEXT NOT NULL,
  id          TEXT NOT NULL,
  data        TEXT NOT NULL,                 -- JSON string
  status      TEXT NOT NULL DEFAULT 'published',  -- draft | published
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents (collection);

-- Version history: one row snapshotting the PREVIOUS state before each change.
CREATE TABLE IF NOT EXISTS versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  collection  TEXT NOT NULL,
  doc_id      TEXT NOT NULL,
  data        TEXT,                          -- previous JSON (NULL if it did not exist)
  op          TEXT NOT NULL,                 -- write | delete | revert
  at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_versions_doc ON versions (collection, doc_id, id DESC);

-- Feature / element / content requests raised from chat (the round-trip to the dev side).
CREATE TABLE IF NOT EXISTS feature_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL DEFAULT 'feature',   -- feature | element | content | bug
  title       TEXT NOT NULL,
  detail      TEXT,
  context     TEXT,                              -- where on the site / which page
  status      TEXT NOT NULL DEFAULT 'open',      -- open | planned | done | declined
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
