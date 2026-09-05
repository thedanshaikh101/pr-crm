-- Trigram + full-text indexes for sub-300ms contact search on large accounts.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE INDEX IF NOT EXISTS contact_search_trgm ON "Contact" USING gin ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contact_last_trgm ON "Contact" USING gin ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contact_email_trgm ON "Contact" USING gin ((("email")::text) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS org_name_trgm ON "Organization" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contact_fts ON "Contact" USING gin (to_tsvector('simple', coalesce("searchText", '')));
