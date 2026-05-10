CREATE TYPE "public"."game_action_request_status" AS ENUM('accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."hand_status" AS ENUM('running', 'ended', 'voided');--> statement-breakpoint
CREATE TYPE "public"."table_status" AS ENUM('waiting', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."virtual_chip_ledger_reason" AS ENUM('initial_grant', 'table_buy_in', 'table_cash_out', 'hand_win', 'hand_loss', 'admin_adjustment');--> statement-breakpoint
CREATE TABLE "game_action_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"hand_id" text NOT NULL,
	"user_id" text NOT NULL,
	"expected_seq" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "game_action_request_status" NOT NULL,
	"first_event_seq" integer,
	"last_event_seq" integer,
	"rejection_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "game_action_requests_expected_seq_check" CHECK ("game_action_requests"."expected_seq" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hand_events" (
	"hand_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"state_hash_after" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hand_events_hand_id_seq_pk" PRIMARY KEY("hand_id","seq"),
	CONSTRAINT "hand_events_seq_nonnegative_check" CHECK ("hand_events"."seq" >= 0),
	CONSTRAINT "hand_events_schema_version_positive_check" CHECK ("hand_events"."schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "hand_participants" (
	"hand_id" text NOT NULL,
	"user_id" text NOT NULL,
	"seat_index" integer NOT NULL,
	"starting_stack" integer NOT NULL,
	"ending_stack" integer,
	"net_chips" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hand_participants_hand_id_user_id_pk" PRIMARY KEY("hand_id","user_id"),
	CONSTRAINT "hand_participants_seat_index_check" CHECK ("hand_participants"."seat_index" >= 0),
	CONSTRAINT "hand_participants_starting_stack_check" CHECK ("hand_participants"."starting_stack" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hands" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"hand_number" integer NOT NULL,
	"status" "hand_status" DEFAULT 'running' NOT NULL,
	"button_seat" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"final_state_hash" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "hands_hand_number_positive_check" CHECK ("hands"."hand_number" > 0),
	CONSTRAINT "hands_button_seat_check" CHECK ("hands"."button_seat" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "table_status" DEFAULT 'waiting' NOT NULL,
	"max_seats" integer NOT NULL,
	"small_blind" integer NOT NULL,
	"big_blind" integer NOT NULL,
	"starting_stack" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tables_max_seats_check" CHECK ("tables"."max_seats" in (2, 6)),
	CONSTRAINT "tables_blinds_positive_check" CHECK ("tables"."small_blind" > 0 and "tables"."big_blind" > 0),
	CONSTRAINT "tables_starting_stack_positive_check" CHECK ("tables"."starting_stack" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "virtual_chip_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "virtual_chip_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"table_id" text,
	"hand_id" text,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" "virtual_chip_ledger_reason" NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_action_requests" ADD CONSTRAINT "game_action_requests_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_action_requests" ADD CONSTRAINT "game_action_requests_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_action_requests" ADD CONSTRAINT "game_action_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hand_events" ADD CONSTRAINT "hand_events_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hand_participants" ADD CONSTRAINT "hand_participants_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hand_participants" ADD CONSTRAINT "hand_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hands" ADD CONSTRAINT "hands_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_chip_accounts" ADD CONSTRAINT "virtual_chip_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_chip_ledger" ADD CONSTRAINT "virtual_chip_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_chip_ledger" ADD CONSTRAINT "virtual_chip_ledger_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_chip_ledger" ADD CONSTRAINT "virtual_chip_ledger_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_action_requests_idempotency_unique" ON "game_action_requests" USING btree ("table_id","user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "game_action_requests_hand_id_idx" ON "game_action_requests" USING btree ("hand_id");--> statement-breakpoint
CREATE INDEX "hand_events_hand_id_idx" ON "hand_events" USING btree ("hand_id");--> statement-breakpoint
CREATE INDEX "hand_events_event_type_idx" ON "hand_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "hand_participants_hand_id_seat_index_unique" ON "hand_participants" USING btree ("hand_id","seat_index");--> statement-breakpoint
CREATE INDEX "hand_participants_user_id_idx" ON "hand_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hands_table_id_hand_number_unique" ON "hands" USING btree ("table_id","hand_number");--> statement-breakpoint
CREATE INDEX "hands_table_id_idx" ON "hands" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "hands_status_idx" ON "hands" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tables_status_idx" ON "tables" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "virtual_chip_ledger_idempotency_unique" ON "virtual_chip_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "virtual_chip_ledger_user_id_idx" ON "virtual_chip_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "virtual_chip_ledger_hand_id_idx" ON "virtual_chip_ledger" USING btree ("hand_id");