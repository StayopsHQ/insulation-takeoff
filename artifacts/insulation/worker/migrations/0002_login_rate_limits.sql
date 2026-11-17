CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_key TEXT NOT NULL,
  email_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_time_idx ON login_attempts(ip_key, attempted_at);
CREATE INDEX IF NOT EXISTS login_attempts_email_time_idx ON login_attempts(email_key, attempted_at);
