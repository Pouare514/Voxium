ALTER TABLE rooms ADD COLUMN required_role TEXT NOT NULL DEFAULT 'user';
UPDATE rooms SET required_role = 'user' WHERE required_role IS NULL OR required_role = '';
