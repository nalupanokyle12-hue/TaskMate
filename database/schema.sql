CREATE DATABASE IF NOT EXISTS taskmate CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE taskmate;
CREATE TABLE users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 full_name VARCHAR(120) NOT NULL,
 username VARCHAR(32) NOT NULL UNIQUE,
 email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 email_verified BOOLEAN NOT NULL DEFAULT FALSE,
 email_login_mfa BOOLEAN NOT NULL DEFAULT TRUE,
 profile_avatar_mime VARCHAR(32) NULL,
 profile_avatar_data MEDIUMBLOB NULL,
 theme ENUM('royal-purple','sage-green','midnight-dark','sky-blue','rose-pink','sunset-amber') NOT NULL DEFAULT 'royal-purple',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE auth_email_challenges (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 purpose ENUM('registration','login') NOT NULL,
 challenge_id_hash CHAR(64) NOT NULL UNIQUE,
 code_hash CHAR(64) NOT NULL,
 expires_at DATETIME NOT NULL,
 attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_email_challenges_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX idx_challenges_user_purpose (user_id,purpose),
 INDEX idx_challenges_expiry (expires_at)
);
CREATE TABLE tasks (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 title VARCHAR(180) NOT NULL,
 description TEXT NULL,
 category VARCHAR(80) NULL,
 due_date DATETIME NULL,
 priority ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
 status ENUM('Pending','In Progress','Completed') NOT NULL DEFAULT 'Pending',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX idx_tasks_user_due (user_id,due_date),
 INDEX idx_tasks_user_status (user_id,status),
 INDEX idx_tasks_user_created (user_id,created_at),
 INDEX idx_tasks_user_priority (user_id,priority)
);
