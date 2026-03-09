-- Seed a test user for local development
-- Login: test@test.com / test1234

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (id, username, email, display_name, status)
VALUES (
  uuid_generate_v4(),
  'testuser',
  'test@test.com',
  'Test User',
  'active'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO credentials (user_id, password_hash)
SELECT u.id, crypt('test1234', gen_salt('bf', 12))
FROM users u
WHERE u.email = 'test@test.com'
ON CONFLICT (user_id) DO NOTHING;
