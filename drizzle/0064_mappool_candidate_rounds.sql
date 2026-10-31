CREATE TABLE "mappool_candidate_rounds" (
	"candidate_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"edition_slug" text NOT NULL,
	CONSTRAINT "mappool_candidate_rounds_candidate_id_round_id_pk" PRIMARY KEY("candidate_id","round_id")
);
--> statement-breakpoint
ALTER TABLE "mappool_candidate_rounds" ADD CONSTRAINT "mappool_candidate_rounds_candidate_id_edition_slug_mappool_candidates_id_edition_slug_fk" FOREIGN KEY ("candidate_id","edition_slug") REFERENCES "public"."mappool_candidates"("id","edition_slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mappool_candidate_rounds" ADD CONSTRAINT "mappool_candidate_rounds_round_id_edition_slug_tournament_rounds_id_edition_slug_fk" FOREIGN KEY ("round_id","edition_slug") REFERENCES "public"."tournament_rounds"("id","edition_slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_round_target_idx" ON "mappool_candidate_rounds" USING btree ("round_id");