DROP TABLE `skill_nodes`;--> statement-breakpoint
DROP TABLE `skill_slots`;--> statement-breakpoint
ALTER TABLE `users` ADD `dust` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `weapon_mastery` DROP COLUMN `sp`;--> statement-breakpoint
ALTER TABLE `weapon_mastery` DROP COLUMN `branch`;