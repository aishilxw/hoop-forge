CREATE TABLE `review_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`client_hash` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`outcome` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer
);
--> statement-breakpoint
CREATE INDEX `review_requests_session_time` ON `review_requests` (`session`,`created_at`);--> statement-breakpoint
CREATE INDEX `review_requests_client_time` ON `review_requests` (`session`,`client_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `review_requests_fingerprint` ON `review_requests` (`session`,`fingerprint`,`created_at`);