CREATE TABLE `register_project_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `register_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`view_key` text NOT NULL,
	`view_hash` text NOT NULL,
	`edit_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `register_items` ADD `tower` text DEFAULT '' NOT NULL;