CREATE TABLE `island_storage` (
	`island_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`island_id`, `item_id`),
	FOREIGN KEY (`island_id`) REFERENCES `islands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `placements` ADD `communal` integer DEFAULT false NOT NULL;