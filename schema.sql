-- ============================================================
-- SyncUp — Production Schema (v2)
-- MySQL 5.7+ / MariaDB 10.3+
-- Run: mysql -u root -p syncup < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS syncup
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE syncup;

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(30)  NOT NULL,
  display_name    VARCHAR(100) NOT NULL,
  email           VARCHAR(190) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  -- IANA timezone, e.g. "America/New_York". Availability is entered in this
  -- timezone client-side, normalized to UTC before it hits `availability`,
  -- so overlap across timezones is computed correctly.
  timezone        VARCHAR(64)  NOT NULL DEFAULT 'UTC',
  email_verified  TINYINT(1)   NOT NULL DEFAULT 0,
  failed_logins   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until    DATETIME NULL DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_username (username),
  UNIQUE KEY uniq_email (email)
) ENGINE=InnoDB;

-- ── Password resets ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL, -- sha256 hex of raw token; raw token never stored
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     NULL DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_token_hash (token_hash),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Email verification ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verifications (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL,
  expires_at  DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_token_hash (token_hash),
  CONSTRAINT fk_verify_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Login attempts (IP + username based rate limiting) ───────
CREATE TABLE IF NOT EXISTS login_attempts (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip_address  VARCHAR(45)  NOT NULL,
  username    VARCHAR(30)  NULL,
  succeeded   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ip_time (ip_address, created_at),
  KEY idx_user_time (username, created_at)
) ENGINE=InnoDB;

-- ── Groups ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `groups` (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  invite_code  CHAR(8)      NOT NULL,
  owner_id     INT UNSIGNED NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_invite_code (invite_code),
  KEY idx_owner (owner_id),
  CONSTRAINT fk_group_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Group members ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  joined_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_membership (group_id, user_id),
  KEY idx_group (group_id, user_id),
  KEY idx_user (user_id),
  CONSTRAINT fk_gm_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  CONSTRAINT fk_gm_user  FOREIGN KEY (user_id)  REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Availability (stored in UTC hours, 0–23) ────────────────
CREATE TABLE IF NOT EXISTS availability (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  weekday     TINYINT UNSIGNED NOT NULL, -- 0=Mon..6=Sun (UTC-normalized week)
  start_hour  TINYINT UNSIGNED NOT NULL, -- 0–23 UTC
  end_hour    TINYINT UNSIGNED NOT NULL, -- 1–24 UTC
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user_weekday (user_id, weekday),
  CONSTRAINT fk_avail_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Cached overlap results ────────────────────────────────────
-- Avoids recomputing overlap on every group view. Invalidated whenever any
-- member of the group saves new availability (see api/availability.php).
CREATE TABLE IF NOT EXISTS group_overlap_cache (
  group_id     INT UNSIGNED PRIMARY KEY,
  overlap_json MEDIUMTEXT   NOT NULL,
  computed_at  DATETIME     NOT NULL,
  CONSTRAINT fk_cache_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE
) ENGINE=InnoDB;
