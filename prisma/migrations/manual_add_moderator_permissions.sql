-- Migration: add_moderator_permissions
-- Adiciona tabela de permissões de moderadores
-- Data: 2026-03-27

CREATE TABLE IF NOT EXISTS `moderator_permissions` (
  `id`         CHAR(36)     NOT NULL,
  `user_id`    CHAR(36)     NOT NULL,
  `panels`     VARCHAR(2000) NOT NULL DEFAULT '[]',
  `games`      VARCHAR(2000) NOT NULL DEFAULT '["all"]',
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `moderator_permissions_user_id_key` (`user_id`),
  KEY `moderator_permissions_user_id_idx` (`user_id`),
  CONSTRAINT `moderator_permissions_user_id_fkey`
    FOREIGN KEY (`user_id`)
    REFERENCES `profiles` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
