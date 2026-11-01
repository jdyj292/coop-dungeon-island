CREATE TABLE `card_pity` (
	`user_id` integer NOT NULL,
	`weapon` text NOT NULL,
	`pack` integer NOT NULL,
	`opened` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `weapon`, `pack`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `card_slots` (
	`user_id` integer NOT NULL,
	`weapon` text NOT NULL,
	`kind` text NOT NULL,
	`slot` integer NOT NULL,
	`card_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `weapon`, `kind`, `slot`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`user_id` integer NOT NULL,
	`card_id` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`enhanced` integer DEFAULT false NOT NULL,
	`variant` text,
	PRIMARY KEY(`user_id`, `card_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
