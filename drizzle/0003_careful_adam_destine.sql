CREATE TABLE `register_deleted_items` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer NOT NULL,
	`generation` integer NOT NULL,
	`f1` integer NOT NULL,
	`f2` integer NOT NULL,
	`fire` integer NOT NULL,
	`category` text NOT NULL,
	`tower` text NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `item_id`, `generation`)
);
--> statement-breakpoint
ALTER TABLE `register_items` ADD `generation` integer DEFAULT 1 NOT NULL;