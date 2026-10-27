CREATE TABLE `register_items` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer NOT NULL,
	`f1` integer DEFAULT false NOT NULL,
	`f2` integer DEFAULT false NOT NULL,
	`fire` integer DEFAULT false NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `register_operations` (
	`user_id` text NOT NULL,
	`op_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `op_id`)
);
--> statement-breakpoint
CREATE TABLE `register_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`init_token` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
