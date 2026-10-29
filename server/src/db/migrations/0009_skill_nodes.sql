CREATE TABLE `skill_nodes` (
	`user_id` integer NOT NULL,
	`node_id` text NOT NULL,
	`points` integer NOT NULL,
	`variant` text,
	PRIMARY KEY(`user_id`, `node_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
