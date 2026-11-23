import BookCard from './BookCard';

// Suggests books from genres the member has borrowed.
// With no borrowing history, it shows top-rated books instead.
export default function RecommendationRow({ books, issues, memberId, onPreview }) {
  const borrowedIds = new Set(
    issues.filter((i) => String(i.user_id) === String(memberId)).map((i) => String(i.book_id))
  );
  const genres = new Set(
    books.filter((b) => borrowedIds.has(String(b.book_id))).map((b) => String(b.category_id))
  );

  const candidates = books.filter((b) => !borrowedIds.has(String(b.book_id)) && b.status !== 'issued');
  const matched = candidates.filter((b) => genres.has(String(b.category_id)));
  const pool = matched.length > 0 ? matched : candidates;

  const picks = [...pool]
    .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
    .slice(0, 4);

  if (picks.length === 0) return null;

  return (
    <section className="reco">
      <div className="page-header">
        <h3>Recommended for you</h3>
        <span className="muted small">
          {matched.length > 0 ? 'Based on genres you have borrowed' : 'Top-rated picks'}
        </span>
      </div>
      <div className="grid">
        {picks.map((book) => (
          <BookCard key={book.book_id} book={book} onPreview={onPreview} />
        ))}
      </div>
    </section>
  );
}