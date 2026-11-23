import { useState } from 'react';

export default function BookCard({ book, onPreview }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const coverSrc =
    book.cover_url || `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false`;
  const isEbook = book.format === 'ebook';

  return (
    <article className="card book-card">
      <div className="cover">
        {coverFailed ? (
          <div className="cover-fallback">{book.title}</div>
        ) : (
          <img src={coverSrc} alt={book.title} loading="lazy" onError={() => setCoverFailed(true)} />
        )}
        <span className={`tag tag-${book.status}`}>{book.status}</span>
        {book.is_bestseller && <span className="tag tag-gold">Bestseller</span>}
      </div>

      <div className="book-body">
        <h3>{book.title}</h3>
        <p className="muted">{book.author}</p>
        <p className="muted small">
          {book.category_name || 'Uncategorised'} · ★ {book.rating ?? '—'}
        </p>

        {isEbook ? (
          <button className="btn ghost small" onClick={() => onPreview && onPreview(book)}>
            📖 Read preview
          </button>
        ) : (
          <p className="shelf">📍 Shelf {book.shelf_location || 'to be assigned'}</p>
        )}
      </div>
    </article>
  );
}