const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { HttpError, parseId } = require('../utils/http');
const { expireStaleReservations } = require('../services/lifecycle');
const { recordAudit } = require('../services/audit');
const { requireAuth, requireRole } = require('../middleware/auth');

const STAFF = requireRole('owner', 'librarian');
const VALID_STATUS = ['available', 'issued', 'reserved'];
const VALID_FORMAT = ['physical', 'ebook'];
const UPDATABLE = new Set([
  'title', 'author', 'publisher', 'publication_year', 'description', 'cover_url',
  'shelf_location', 'format', 'rating', 'is_bestseller', 'status', 'category_id',
]);

const BOOK_SELECT = `
  SELECT b.book_id, b.title, b.author, b.isbn, b.publisher, b.publication_year,
         b.description, b.cover_url, b.shelf_location, b.format,
         b.rating::float AS rating, b.is_bestseller, b.status,
         b.category_id, c.name AS category_name, b.created_at
  FROM books b
  LEFT JOIN categories c ON c.category_id = b.category_id
`;

function toYearOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1000 || year > 2100) {
    throw new HttpError(400, 'publication_year must be between 1000 and 2100');
  }
  return year;
}

function toRatingOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const rating = Number(value);
  if (Number.isNaN(rating) || rating < 0 || rating > 5) {
    throw new HttpError(400, 'rating must be between 0 and 5');
  }
  return rating;
}

async function getBookById(libraryId, bookId) {
  const result = await query(`${BOOK_SELECT} WHERE b.book_id = $1 AND b.library_id = $2`, [bookId, libraryId]);
  return result.rows[0] || null;
}

async function fetchBooks(libraryId, { status, category_id, format, search, sort }) {
  const clauses = ['b.library_id = $1'];
  const params = [libraryId];

  if (status) {
    if (!VALID_STATUS.includes(status)) throw new HttpError(400, 'Invalid status filter');
    params.push(status);
    clauses.push(`b.status = $${params.length}`);
  }

  if (category_id) {
    params.push(parseId(category_id, 'category_id'));
    clauses.push(`b.category_id = $${params.length}`);
  }

  if (format) {
    if (!VALID_FORMAT.includes(format)) throw new HttpError(400, 'Invalid format filter');
    params.push(format);
    clauses.push(`b.format = $${params.length}`);
  }

  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    const p = `$${params.length}`;
    clauses.push(`(b.title ILIKE ${p} OR b.author ILIKE ${p} OR b.isbn ILIKE ${p})`);
  }

  let orderBy = 'b.book_id ASC';
  if (sort === 'newest') orderBy = 'b.created_at DESC, b.book_id DESC';
  if (sort === 'title') orderBy = 'LOWER(b.title) ASC';

  const result = await query(`${BOOK_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy}`, params);
  return result.rows;
}

// Every book route needs a logged-in user (members and staff).
router.use(requireAuth());

// GET /api/books?status=&category_id=&format=&search=&sort=
router.get('/', async (req, res, next) => {
  try {
    await expireStaleReservations();
    const books = await fetchBooks(req.user.library_id, req.query);
    res.json({ books });
  } catch (error) {
    next(error);
  }
});

// GET /api/books/search?q=term
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    if (!q.trim()) return res.json({ books: [] });
    const books = await fetchBooks(req.user.library_id, { search: q });
    return res.json({ books });
  } catch (error) {
    return next(error);
  }
});

router.get('/:book_id', async (req, res, next) => {
  try {
    const book = await getBookById(req.user.library_id, parseId(req.params.book_id, 'book_id'));
    if (!book) throw new HttpError(404, 'Book not found');
    return res.json({ book });
  } catch (error) {
    return next(error);
  }
});

// POST /api/books (staff only)
router.post('/', STAFF, async (req, res, next) => {
  try {
    const body = req.body || {};
    const libraryId = req.user.library_id;

    if (!body.title) throw new HttpError(400, 'Missing required field: title');
    if (!body.author) throw new HttpError(400, 'Missing required field: author');
    if (!body.isbn) throw new HttpError(400, 'Missing required field: isbn');
    if (!body.category_id) throw new HttpError(400, 'Missing required field: category_id');

    const categoryId = parseId(body.category_id, 'category_id');
    const format = body.format || 'physical';
    if (!VALID_FORMAT.includes(format)) throw new HttpError(400, 'format must be physical or ebook');

    const category = await query(
      'SELECT 1 FROM categories WHERE category_id = $1 AND library_id = $2',
      [categoryId, libraryId]
    );
    if (category.rows.length === 0) throw new HttpError(400, 'Category does not exist');

    const duplicate = await query('SELECT 1 FROM books WHERE isbn = $1 AND library_id = $2', [body.isbn, libraryId]);
    if (duplicate.rows.length > 0) throw new HttpError(400, 'ISBN must be unique');

    const inserted = await query(
      `
        INSERT INTO books (
          library_id, category_id, isbn, title, author, publisher, publication_year,
          description, cover_url, shelf_location, format, rating, is_bestseller, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'available')
        RETURNING book_id
      `,
      [
        libraryId,
        categoryId,
        body.isbn,
        body.title,
        body.author,
        body.publisher || null,
        toYearOrNull(body.publication_year),
        body.description || null,
        body.cover_url || null,
        body.shelf_location || null,
        format,
        toRatingOrNull(body.rating),
        Boolean(body.is_bestseller),
      ]
    );

    const bookId = inserted.rows[0].book_id;
    await recordAudit(query, {
      library_id: libraryId,
      actor_user_id: req.user.user_id,
      action: 'book_created',
      entity: 'book',
      entity_id: bookId,
      details: { title: body.title, isbn: body.isbn },
      ip: req.ip,
    });

    const book = await getBookById(libraryId, bookId);
    return res.status(201).json({ book });
  } catch (error) {
    return next(error);
  }
});

// PUT /api/books/:book_id (staff only)
router.put('/:book_id', STAFF, async (req, res, next) => {
  try {
    const libraryId = req.user.library_id;
    const bookId = parseId(req.params.book_id, 'book_id');
    const body = req.body || {};

    const sets = [];
    const values = [];
    const changed = [];

    for (const [key, rawValue] of Object.entries(body)) {
      if (!UPDATABLE.has(key)) continue;

      let value = rawValue;
      if (key === 'status' && !VALID_STATUS.includes(rawValue)) throw new HttpError(400, 'Invalid status');
      if (key === 'format' && !VALID_FORMAT.includes(rawValue)) {
        throw new HttpError(400, 'format must be physical or ebook');
      }
      if (key === 'rating') value = toRatingOrNull(rawValue);
      if (key === 'publication_year') value = toYearOrNull(rawValue);
      if (key === 'is_bestseller') value = Boolean(rawValue);
      if (key === 'category_id') {
        value = parseId(rawValue, 'category_id');
        const cat = await query('SELECT 1 FROM categories WHERE category_id = $1 AND library_id = $2', [
          value,
          libraryId,
        ]);
        if (cat.rows.length === 0) throw new HttpError(400, 'Category does not exist');
      }

      values.push(value);
      sets.push(`${key} = $${values.length}`);
      changed.push(key);
    }

    if (sets.length === 0) throw new HttpError(400, 'No valid fields provided to update');

    values.push(bookId, libraryId);
    const updated = await query(
      `
        UPDATE books SET ${sets.join(', ')}, updated_at = NOW()
        WHERE book_id = $${values.length - 1} AND library_id = $${values.length}
        RETURNING book_id
      `,
      values
    );
    if (updated.rows.length === 0) throw new HttpError(404, 'Book not found');

    await recordAudit(query, {
      library_id: libraryId,
      actor_user_id: req.user.user_id,
      action: 'book_updated',
      entity: 'book',
      entity_id: bookId,
      details: { fields: changed },
      ip: req.ip,
    });

    const book = await getBookById(libraryId, bookId);
    return res.json({ book });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;