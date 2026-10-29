-- Preserve existing accounts: only accounts created after this migration require a new confirmation.
USE taskmate;
ALTER TABLE users
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE AFTER password_hash,
  ADD COLUMN verification_token_hash CHAR(64) NULL UNIQUE AFTER email_verified,
  ADD COLUMN verification_expires_at DATETIME NULL AFTER verification_token_hash,
  ADD INDEX idx_users_verification_expiry (verification_expires_at);
UPDATE users SET email_verified=TRUE WHERE email_verified=FALSE;
