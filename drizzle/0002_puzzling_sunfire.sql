ALTER TABLE `register_items` ADD `deleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `register_profiles` ADD `next_stair_id` integer DEFAULT 17 NOT NULL;--> statement-breakpoint
ALTER TABLE `register_profiles` ADD `next_lift_id` integer DEFAULT 17 NOT NULL;