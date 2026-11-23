-- =====================================================================
-- Library Management System - Migration 001 (v2 upgrade)
-- Safe to run more than once. Keeps all existing data.
-- Run in pgAdmin: select library_system > Query Tool > paste > F5
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. Book catalog metadata
ALTER TABLE books ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(50);
ALTER TABLE books ADD COLUMN IF NOT EXISTS format VARCHAR(20) NOT NULL DEFAULT 'physical';
ALTER TABLE books ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1);
ALTER TABLE books ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_format_check;
ALTER TABLE books ADD CONSTRAINT books_format_check
    CHECK (format IN ('physical', 'ebook'));

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_rating_check;
ALTER TABLE books ADD CONSTRAINT books_rating_check
    CHECK (rating IS NULL OR rating BETWEEN 0 AND 5);

-- 2. Fine tracking on returns
ALTER TABLE returns ADD COLUMN IF NOT EXISTS days_overdue INTEGER NOT NULL DEFAULT 0;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS fine_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_fine_check;
ALTER TABLE returns ADD CONSTRAINT returns_fine_check
    CHECK (fine_amount >= 0 AND days_overdue >= 0);

-- 3. Waitlist support on reservations
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
    CHECK (status IN ('pending', 'waitlisted', 'fulfilled', 'cancelled', 'expired'));

DROP INDEX IF EXISTS uq_active_reservation_user_book;
CREATE UNIQUE INDEX uq_active_reservation_user_book
    ON reservations (user_id, book_id)
    WHERE status IN ('pending', 'waitlisted');

-- 4. Sample catalog details for the 5 seed books (only fills empty rows)
UPDATE books SET description = 'An epic poem about Odysseus returning home after the Trojan War.',
                 shelf_location = 'A-01', format = 'physical', rating = 4.6, is_bestseller = TRUE
WHERE book_id = 1 AND description IS NULL;

UPDATE books SET description = 'A comprehensive guide to algorithms and data structures.',
                 shelf_location = 'B-03', format = 'physical', rating = 4.7, is_bestseller = TRUE
WHERE book_id = 2 AND description IS NULL;

UPDATE books SET description = 'A broad survey of human history from ancient times to the modern era.',
                 shelf_location = 'C-02', format = 'physical', rating = 4.2, is_bestseller = FALSE
WHERE book_id = 3 AND description IS NULL;

UPDATE books SET description = 'A handbook of agile software craftsmanship.',
                 shelf_location = NULL, format = 'ebook', rating = 4.5, is_bestseller = FALSE
WHERE book_id = 4 AND description IS NULL;

UPDATE books SET description = 'A biography of the Renaissance polymath.',
                 shelf_location = 'D-05', format = 'physical', rating = 4.4, is_bestseller = FALSE
WHERE book_id = 5 AND description IS NULL;

INSERT INTO schema_migrations (version) VALUES ('001_v2_upgrade')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Verification: should show 5 books, with book 4 as an ebook
SELECT book_id, title, format, shelf_location, rating FROM books ORDER BY book_id;