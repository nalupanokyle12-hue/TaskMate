-- Run once on the existing TaskMate database after the earlier email-verification migration.
-- Existing accounts are trusted as verified; new accounts must enter a signup code.
USE taskmate;
ALTER TABLE users
  ADD COLUMN username VARCHAR(32) NULL UNIQUE AFTER full_name,
  ADD COLUMN email_login_mfa BOOLEAN NOT NULL DEFAULT TRUE AFTER email_verified,
  ADD COLUMN profile_avatar_mime VARCHAR(32) NULL AFTER email_login_mfa,
  ADD COLUMN profile_avatar_data MEDIUMBLOB NULL AFTER profile_avatar_mime;
UPDATE users SET username=CONCAT('student',id) WHERE username IS NULL;
ALTER TABLE users MODIFY username VARCHAR(32) NOT NULL;
UPDATE users SET email_verified=TRUE WHERE email_verified=FALSE;
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
