CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`island_id` integer NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`item_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`island_id`) REFERENCES `islands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_island_created` ON `activity_log` (`island_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`ip` text NOT NULL,
	`event` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_log_created` ON `auth_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`user_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `islands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`treasury` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `islands_invite_code` ON `islands` (`invite_code`);--> statement-breakpoint
CREATE TABLE `placements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`island_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`rotation` integer DEFAULT 0 NOT NULL,
	`placed_by` integer,
	`placed_at` integer NOT NULL,
	FOREIGN KEY (`island_id`) REFERENCES `islands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`placed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `placements_island` ON `placements` (`island_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nickname` text NOT NULL,
	`nickname_key` text NOT NULL,
	`password_hash` text NOT NULL,
	`recovery_hash` text NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`island_id` integer,
	`wallet` integer DEFAULT 0 NOT NULL,
	`hair_style` integer DEFAULT 0 NOT NULL,
	`hair_color` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`island_id`) REFERENCES `islands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_nickname_key` ON `users` (`nickname_key`);--> statement-breakpoint
CREATE INDEX `users_island` ON `users` (`island_id`);--> statement-breakpoint
CREATE TABLE `weapon_mastery` (
	`user_id` integer NOT NULL,
	`weapon` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`exp` integer DEFAULT 0 NOT NULL,
	`sp` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `weapon`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
