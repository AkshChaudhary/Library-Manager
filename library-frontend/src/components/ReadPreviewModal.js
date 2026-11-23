export default function ReadPreviewModal({ book, onClose }) {
  if (!book) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>{book.title}</h2>
        <p className="muted">{book.author}</p>
        <p style={{ margin: '14px 0' }}>{book.description || 'No description available.'}</p>
        <p className="muted small">
          This preview is simulated. The button below opens the real book page on Open Library.
        </p>
        <div className="actions">
          <a
            className="btn"
            href={`https://openlibrary.org/isbn/${book.isbn}`}
            target="_blank"
            rel="noreferrer"
          >
            Open on Open Library
          </a>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}