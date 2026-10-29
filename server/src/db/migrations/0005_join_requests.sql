CREATE TABLE `join_requests` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`island_id` integer NOT NULL,
	`rejected` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`island_id`) REFERENCES `islands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `join_requests_island` ON `join_requests` (`island_id`);--> statement-breakpoint
ALTER TABLE `islands` ADD `owner_id` integer;