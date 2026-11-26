CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;--> statement-breakpoint
ALTER TABLE "chat_source_vectors" ADD COLUMN "embedding_vector" public.vector;--> statement-breakpoint

CREATE FUNCTION public.sync_chat_source_embedding_vector() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.embedding_vector := CASE
    WHEN cardinality(NEW.embedding) BETWEEN 1 AND 16000
    THEN NEW.embedding::public.vector
  END;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER chat_source_embedding_vector_sync
BEFORE INSERT OR UPDATE OF embedding ON "chat_source_vectors"
FOR EACH ROW EXECUTE FUNCTION public.sync_chat_source_embedding_vector();
