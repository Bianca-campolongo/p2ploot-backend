-- CreateTable
CREATE TABLE `profiles` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NULL,
    `username` VARCHAR(191) NULL,
    `wallet_address` VARCHAR(255) NULL,
    `primary_auth_method` VARCHAR(50) NOT NULL DEFAULT 'discord',
    `wallet_linked_at` DATETIME(3) NULL,
    `discord_id` VARCHAR(255) NULL,
    `discord_username` VARCHAR(255) NULL,
    `discord_global_name` VARCHAR(255) NULL,
    `bio` TEXT NULL,
    `avatar_url` VARCHAR(500) NULL,
    `is_private` BOOLEAN NOT NULL DEFAULT false,
    `role` VARCHAR(50) NOT NULL DEFAULT 'user',
    `reputation_score` INTEGER NOT NULL DEFAULT 0,
    `discord_created_at` DATETIME(3) NULL,
    `credits` DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `profiles_email_key`(`email`),
    UNIQUE INDEX `profiles_wallet_address_key`(`wallet_address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_logins` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `wallet_address` VARCHAR(255) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_login_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `wallet_logins_wallet_address_key`(`wallet_address`),
    INDEX `wallet_logins_wallet_address_idx`(`wallet_address`),
    INDEX `wallet_logins_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guilds` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `max_members` INTEGER NOT NULL DEFAULT 50,
    `members_count` INTEGER NOT NULL DEFAULT 0,
    `discord_url` VARCHAR(500) NULL,
    `image_url` VARCHAR(500) NULL,
    `game_id` BIGINT NULL,
    `owner_address` VARCHAR(255) NOT NULL,
    `owner_id` CHAR(36) NULL,
    `strikes` INTEGER NOT NULL DEFAULT 0,
    `access_expires_at` DATETIME(3) NULL,
    `creation_cost_paid` BOOLEAN NOT NULL DEFAULT false,
    `dkp_config` JSON NULL,
    `dkp_decay_active` BOOLEAN NOT NULL DEFAULT false,
    `dkp_decay_percent` INTEGER NULL DEFAULT 0,
    `dkp_decay_interval` VARCHAR(50) NULL DEFAULT 'weekly',
    `dkp_decay_day` INTEGER NULL DEFAULT 1,
    `dkp_role_bonuses` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `guilds_game_id_idx`(`game_id`),
    INDEX `guilds_owner_id_idx`(`owner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_members` (
    `id` CHAR(36) NOT NULL,
    `guild_id` BIGINT NOT NULL,
    `member_id` CHAR(36) NOT NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'member',
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dkp_balance` INTEGER NOT NULL DEFAULT 0,
    `character_name` VARCHAR(255) NULL,
    `character_class` VARCHAR(255) NULL,
    `character_level` INTEGER NULL,
    `power_score` INTEGER NULL,
    `codex_score` INTEGER NULL,
    `custom_values` JSON NULL,

    INDEX `guild_members_guild_id_idx`(`guild_id`),
    INDEX `guild_members_member_id_idx`(`member_id`),
    UNIQUE INDEX `guild_members_guild_id_member_id_key`(`guild_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_requests` (
    `id` CHAR(36) NOT NULL,
    `guild_id` BIGINT NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `character_name` VARCHAR(255) NULL,
    `custom_values` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `guild_requests_guild_id_idx`(`guild_id`),
    INDEX `guild_requests_user_id_idx`(`user_id`),
    UNIQUE INDEX `guild_requests_guild_id_user_id_key`(`guild_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_custom_fields` (
    `id` CHAR(36) NOT NULL,
    `guild_id` BIGINT NOT NULL,
    `field_name` VARCHAR(255) NOT NULL,
    `field_type` VARCHAR(50) NOT NULL DEFAULT 'text',
    `is_required` BOOLEAN NOT NULL DEFAULT false,
    `field_order` INTEGER NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `guild_custom_fields_guild_id_idx`(`guild_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_items` (
    `id` CHAR(36) NOT NULL,
    `game` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `image_url` VARCHAR(500) NULL,
    `created_by` CHAR(36) NULL,
    `rarity` VARCHAR(50) NULL,
    `item_type` VARCHAR(50) NULL,
    `is_nft` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `game_items_game_idx`(`game`),
    INDEX `game_items_name_idx`(`name`),
    UNIQUE INDEX `game_items_game_name_key`(`game`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_auctions` (
    `id` CHAR(36) NOT NULL,
    `guild_id` BIGINT NOT NULL,
    `item_id` CHAR(36) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(50) NOT NULL DEFAULT 'warehouse',
    `starting_bid` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `current_bid` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `min_bid_increment` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `start_time` DATETIME(3) NULL,
    `end_time` DATETIME(3) NULL,
    `anti_snipe_duration` INTEGER NULL DEFAULT 5,
    `winner_id` CHAR(36) NULL,
    `requirements` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `guild_auctions_guild_id_status_idx`(`guild_id`, `status`),
    INDEX `guild_auctions_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_bids` (
    `id` CHAR(36) NOT NULL,
    `auction_id` CHAR(36) NOT NULL,
    `bidder_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `guild_bids_auction_id_idx`(`auction_id`),
    INDEX `guild_bids_bidder_id_idx`(`bidder_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_dkp_events_config` (
    `id` CHAR(36) NOT NULL,
    `guild_id` BIGINT NOT NULL,
    `event_name` VARCHAR(255) NOT NULL,
    `dkp_amount` INTEGER NOT NULL DEFAULT 0,
    `recurrence` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `guild_dkp_events_config_guild_id_idx`(`guild_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_dkp_ledger` (
    `id` CHAR(36) NOT NULL,
    `guild_id` BIGINT NOT NULL,
    `member_id` CHAR(36) NOT NULL,
    `event_type_id` CHAR(36) NULL,
    `description` TEXT NULL,
    `amount` INTEGER NOT NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `guild_dkp_ledger_guild_id_idx`(`guild_id`),
    INDEX `guild_dkp_ledger_member_id_idx`(`member_id`),
    INDEX `guild_dkp_ledger_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_giveaways` (
    `id` CHAR(36) NOT NULL,
    `guild_id` BIGINT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `item_id` CHAR(36) NULL,
    `custom_prize` TEXT NULL,
    `filters` JSON NULL,
    `winner_id` CHAR(36) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    INDEX `guild_giveaways_guild_id_idx`(`guild_id`),
    INDEX `guild_giveaways_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_character_shares` (
    `id` CHAR(36) NOT NULL,
    `guild_member_id` CHAR(36) NOT NULL,
    `shared_with_user_id` CHAR(36) NOT NULL,
    `permissions` JSON NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approved_at` DATETIME(3) NULL,
    `guildId` BIGINT NULL,

    INDEX `guild_character_shares_guild_member_id_idx`(`guild_member_id`),
    INDEX `guild_character_shares_shared_with_user_id_idx`(`shared_with_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `games` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `details` TEXT NULL,
    `genre` VARCHAR(100) NULL,
    `blockchain` VARCHAR(255) NULL,
    `website` VARCHAR(500) NULL,
    `image_url` VARCHAR(500) NULL,
    `server_regions` JSON NULL,
    `status` VARCHAR(50) NULL,
    `mode` VARCHAR(100) NULL,
    `requirements` VARCHAR(500) NULL,
    `token_id` VARCHAR(100) NULL,
    `likes` INTEGER NOT NULL DEFAULT 0,
    `dislikes` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `games_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_transactions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `balance_after` DECIMAL(10, 2) NOT NULL,
    `transaction_type` VARCHAR(50) NOT NULL,
    `reference_type` VARCHAR(255) NULL,
    `reference_id` BIGINT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `credit_transactions_user_id_idx`(`user_id`),
    INDEX `credit_transactions_created_at_idx`(`created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_requests` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `reason` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `reviewed_by` CHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `admin_note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `credit_requests_user_id_idx`(`user_id`),
    INDEX `credit_requests_status_idx`(`status`),
    INDEX `credit_requests_created_at_idx`(`created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_request_messages` (
    `id` CHAR(36) NOT NULL,
    `credit_request_id` BIGINT NOT NULL,
    `sender_id` CHAR(36) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `credit_request_messages_credit_request_id_idx`(`credit_request_id`),
    INDEX `credit_request_messages_sender_id_idx`(`sender_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `market_ads` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` CHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `price` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(50) NULL,
    `game` VARCHAR(255) NULL,
    `server` VARCHAR(255) NULL,
    `region` VARCHAR(255) NULL,
    `type` VARCHAR(50) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `image_url` VARCHAR(500) NULL,
    `seller_address` VARCHAR(255) NULL,
    `expires_at` DATETIME(3) NULL,
    `last_renewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `market_ads_user_id_idx`(`user_id`),
    INDEX `market_ads_status_idx`(`status`),
    INDEX `market_ads_game_server_region_idx`(`game`, `server`, `region`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ad_reports` (
    `id` CHAR(36) NOT NULL,
    `ad_id` BIGINT NOT NULL,
    `reporter_id` CHAR(36) NULL,
    `reason` TEXT NOT NULL,
    `details` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ad_reports_ad_id_idx`(`ad_id`),
    INDEX `ad_reports_reporter_id_idx`(`reporter_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` CHAR(36) NOT NULL,
    `conversation_id` CHAR(36) NOT NULL,
    `sender_id` CHAR(36) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `messages_conversation_id_idx`(`conversation_id`),
    INDEX `messages_sender_id_idx`(`sender_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` CHAR(36) NOT NULL,
    `buyer_id` CHAR(36) NOT NULL,
    `seller_id` CHAR(36) NOT NULL,
    `ad_id` BIGINT NULL,
    `buyer_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `seller_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `is_completed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `conversations_buyer_id_idx`(`buyer_id`),
    INDEX `conversations_seller_id_idx`(`seller_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_votes` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `game_id` BIGINT NOT NULL,
    `vote_type` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `game_votes_user_id_idx`(`user_id`),
    INDEX `game_votes_game_id_idx`(`game_id`),
    UNIQUE INDEX `game_votes_user_id_game_id_key`(`user_id`, `game_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_item_favorites` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` CHAR(36) NOT NULL,
    `item_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_item_favorites_user_id_idx`(`user_id`),
    INDEX `user_item_favorites_item_id_idx`(`item_id`),
    UNIQUE INDEX `user_item_favorites_user_id_item_id_key`(`user_id`, `item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trust_votes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `voter_id` CHAR(36) NOT NULL,
    `target_id` CHAR(36) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `trust_votes_voter_id_target_id_key`(`voter_id`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_tickets` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'open',
    `priority` VARCHAR(50) NOT NULL DEFAULT 'normal',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `support_tickets_user_id_idx`(`user_id`),
    INDEX `support_tickets_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_ticket_messages` (
    `id` CHAR(36) NOT NULL,
    `support_ticket_id` CHAR(36) NOT NULL,
    `sender_id` CHAR(36) NOT NULL,
    `content` TEXT NOT NULL,
    `is_internal` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_ticket_messages_support_ticket_id_idx`(`support_ticket_id`),
    INDEX `support_ticket_messages_sender_id_idx`(`sender_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_comments` (
    `id` CHAR(36) NOT NULL,
    `game_id` BIGINT NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NULL,
    `content` TEXT NOT NULL,
    `likes` INTEGER NOT NULL DEFAULT 0,
    `dislikes` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `game_comments_game_id_idx`(`game_id`),
    INDEX `game_comments_user_id_idx`(`user_id`),
    INDEX `game_comments_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_comment_votes` (
    `id` CHAR(36) NOT NULL,
    `comment_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `vote_type` VARCHAR(10) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `game_comment_votes_comment_id_idx`(`comment_id`),
    INDEX `game_comment_votes_user_id_idx`(`user_id`),
    UNIQUE INDEX `game_comment_votes_comment_id_user_id_key`(`comment_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` CHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `game` VARCHAR(255) NULL,
    `category` VARCHAR(50) NOT NULL DEFAULT 'other',
    `event_mode` VARCHAR(20) NOT NULL DEFAULT 'online',
    `event_date` DATETIME(3) NOT NULL,
    `location` VARCHAR(500) NULL,
    `prize_pool` VARCHAR(255) NULL,
    `image_url` VARCHAR(500) NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'upcoming',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `events_organizer_id_idx`(`organizer_id`),
    INDEX `events_event_date_idx`(`event_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wallet_logins` ADD CONSTRAINT `wallet_logins_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guilds` ADD CONSTRAINT `guilds_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guilds` ADD CONSTRAINT `guilds_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_members` ADD CONSTRAINT `guild_members_guild_id_fkey` FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_members` ADD CONSTRAINT `guild_members_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_requests` ADD CONSTRAINT `guild_requests_guild_id_fkey` FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_requests` ADD CONSTRAINT `guild_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_custom_fields` ADD CONSTRAINT `guild_custom_fields_guild_id_fkey` FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_items` ADD CONSTRAINT `game_items_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_auctions` ADD CONSTRAINT `guild_auctions_guild_id_fkey` FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_auctions` ADD CONSTRAINT `guild_auctions_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `game_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_auctions` ADD CONSTRAINT `guild_auctions_winner_id_fkey` FOREIGN KEY (`winner_id`) REFERENCES `profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_bids` ADD CONSTRAINT `guild_bids_auction_id_fkey` FOREIGN KEY (`auction_id`) REFERENCES `guild_auctions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_bids` ADD CONSTRAINT `guild_bids_bidder_id_fkey` FOREIGN KEY (`bidder_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_dkp_events_config` ADD CONSTRAINT `guild_dkp_events_config_guild_id_fkey` FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_dkp_ledger` ADD CONSTRAINT `guild_dkp_ledger_guild_id_fkey` FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_dkp_ledger` ADD CONSTRAINT `guild_dkp_ledger_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_dkp_ledger` ADD CONSTRAINT `guild_dkp_ledger_event_type_id_fkey` FOREIGN KEY (`event_type_id`) REFERENCES `guild_dkp_events_config`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_giveaways` ADD CONSTRAINT `guild_giveaways_guild_id_fkey` FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_character_shares` ADD CONSTRAINT `guild_character_shares_guild_member_id_fkey` FOREIGN KEY (`guild_member_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_character_shares` ADD CONSTRAINT `guild_character_shares_shared_with_user_id_fkey` FOREIGN KEY (`shared_with_user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_character_shares` ADD CONSTRAINT `guild_character_shares_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `guilds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_transactions` ADD CONSTRAINT `credit_transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_requests` ADD CONSTRAINT `credit_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_request_messages` ADD CONSTRAINT `credit_request_messages_credit_request_id_fkey` FOREIGN KEY (`credit_request_id`) REFERENCES `credit_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_request_messages` ADD CONSTRAINT `credit_request_messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `market_ads` ADD CONSTRAINT `market_ads_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ad_reports` ADD CONSTRAINT `ad_reports_ad_id_fkey` FOREIGN KEY (`ad_id`) REFERENCES `market_ads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ad_reports` ADD CONSTRAINT `ad_reports_reporter_id_fkey` FOREIGN KEY (`reporter_id`) REFERENCES `profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_seller_id_fkey` FOREIGN KEY (`seller_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_votes` ADD CONSTRAINT `game_votes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_votes` ADD CONSTRAINT `game_votes_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_item_favorites` ADD CONSTRAINT `user_item_favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_item_favorites` ADD CONSTRAINT `user_item_favorites_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `game_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trust_votes` ADD CONSTRAINT `trust_votes_voter_id_fkey` FOREIGN KEY (`voter_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trust_votes` ADD CONSTRAINT `trust_votes_target_id_fkey` FOREIGN KEY (`target_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_ticket_messages` ADD CONSTRAINT `support_ticket_messages_support_ticket_id_fkey` FOREIGN KEY (`support_ticket_id`) REFERENCES `support_tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_ticket_messages` ADD CONSTRAINT `support_ticket_messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_comments` ADD CONSTRAINT `game_comments_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_comments` ADD CONSTRAINT `game_comments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_comments` ADD CONSTRAINT `game_comments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `game_comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_comment_votes` ADD CONSTRAINT `game_comment_votes_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `game_comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_comment_votes` ADD CONSTRAINT `game_comment_votes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_organizer_id_fkey` FOREIGN KEY (`organizer_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
