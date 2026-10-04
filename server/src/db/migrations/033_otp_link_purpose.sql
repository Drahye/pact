-- Verifying a phone from a signed-in account is its own purpose: a login code cannot attach a number, nor the reverse.
ALTER TABLE otp_challenges DROP CONSTRAINT otp_challenges_purpose_check;
ALTER TABLE otp_challenges ADD CONSTRAINT otp_challenges_purpose_check CHECK (purpose IN ('login', 'pin_reset', 'link'));
