const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');

const STAFF = requireRole('owner', 'librarian');

router.use(requireAuth());

router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `
        SELECT c.category_id, c.name, c.description, COUNT(b.book_id)::int AS book_count
        FROM categories c
        LEFT JOIN books b ON b.category_id = c.category_id AND b.library_id = c.library_id
        WHERE c.library_id = $1
        GROUP BY c.category_id, c.name, c.description
        ORDER BY c.name ASC
      `,
      [req.user.library_id]
    );
    res.json({ categories: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', STAFF, async (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) throw new HttpError(400, 'Missing required field: name');

    const libraryId = req.user.library_id;
    const cleanName = String(name).trim();

    const duplicate = await query(
      'SELECT 1 FROM categories WHERE library_id = $1 AND LOWER(name) = LOWER($2)',
      [libraryId, cleanName]
    );
    if (duplicate.rows.length > 0) throw new HttpError(400, 'Category already exists');

    const inserted = await query(
      `INSERT INTO categories (library_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING category_id, name, description`,
      [libraryId, cleanName, description || null]
    );
    res.status(201).json({ category: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;