import { useMemo, useState } from 'react';
import { post, ApiError } from '../api';
import BookCard from '../components/BookCard';

export default function MemberCatalog({ books }) {
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books
      .filter((b) => !q || `${b.title} ${b.author} ${b.isbn}`.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [books, search]);

  const reserve = async (book) => {
    setMessage(null);
    try {
      const res = await post('/reservations', { book_id: book.book_id, expire_days: 7 });
      setMessage({
        type: 'success',
        text:
          res.reservation.status === 'waitlisted'
            ? `"${book.title}" is on loan. You are #${res.queue_position} on the waitlist.`
            : `"${book.title}" is reserved for you. Collect within 7 days.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not reserve.' });
    }
  };

  return (
    <div>
      {message && <div className={`alert ${message.type}`}>{message.text}</div>}
      <input
        className="search"
        type="search"
        placeholder="Search by title, author or ISBN…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 18, width: '100%' }}
      />
      {visible.length === 0 ? (
        <div className="card empty">No books match your search.</div>
      ) : (
        <div className="grid">
          {visible.map((book) => (
            <div key={book.book_id}>
              <BookCard book={book} />
              {book.format === 'physical' && book.status !== 'available' && (
                <button className="btn ghost small" style={{ marginTop: 8, width: '100%' }} onClick={() => reserve(book)}>
                  Reserve
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}