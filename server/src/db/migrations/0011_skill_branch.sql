CREATE TABLE `skill_slots` (
	`user_id` integer NOT NULL,
	`weapon` text NOT NULL,
	`branch` text NOT NULL,
	`slot` integer NOT NULL,
	`node_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `weapon`, `branch`, `slot`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `weapon_mastery` ADD `branch` text DEFAULT 'A' NOT NULL;--> statement-breakpoint
ALTER TABLE `skill_nodes` DROP COLUMN `slot`;