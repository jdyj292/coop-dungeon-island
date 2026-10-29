CREATE TABLE `island_facilities` (
	`island_id` integer NOT NULL,
	`facility_id` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	PRIMARY KEY(`island_id`, `facility_id`),
	FOREIGN KEY (`island_id`) REFERENCES `islands`(`id`) ON UPDATE no action ON DELETE no action
);
