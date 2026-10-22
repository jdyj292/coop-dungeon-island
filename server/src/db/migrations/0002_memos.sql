CREATE TABLE `memos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`island_id` integer NOT NULL,
	`user_id` integer,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`island_id`) REFERENCES `islands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `memos_island_created` ON `memos` (`island_id`,`created_at`);