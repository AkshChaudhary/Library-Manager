import { useState } from 'react';
import { post, ApiError } from '../api';
import BookCard from '../components/BookCard';

const EMPTY = {
  title: '', author: '', isbn: '', category_id: '', publisher: '',
  publication_year: '', format: 'physical', shelf_location: '', rating: '', is_bestseller: false, description: '',
};

export default function StaffCatalog({ books, categories, onChanged }) {
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await post('/books', {
        ...form,
        category_id: Number(form.category_id),
        publication_year: form.publication_year ? Number(form.publication_year) : null,
        rating: form.rating ? Number(form.rating) : null,
      });
      setMessage({ type: 'success', text: 'Book added to the catalog.' });
      setForm(EMPTY);
      await onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not add book.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-layout">
      <form className="card form" onSubmit={submit}>
        <h3>Add a book</h3>
        {message && <div className={`alert ${message.type}`}>{message.text}</div>}
        <div className="form-grid">
          <div className="field"><label>Title *</label><input value={form.title} onChange={set('title')} required /></div>
          <div className="field"><label>Author *</label><input value={form.author} onChange={set('author')} required /></div>
          <div className="field"><label>ISBN *</label><input value={form.isbn} onChange={set('isbn')} required /></div>
          <div className="field">
            <label>Genre *</label>
            <select value={form.category_id} onChange={set('category_id')} required>
              <option value="">Choose a genre</option>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Publisher</label><input value={form.publisher} onChange={set('publisher')} /></div>
          <div className="field"><label>Year</label><input type="number" value={form.publication_year} onChange={set('publication_year')} /></div>
          <div className="field">
            <label>Format</label>
            <select value={form.format} onChange={set('format')}>
              <option value="physical">Physical</option>
              <option value="ebook">Digital (e-book)</option>
            </select>
          </div>
          <div className="field"><label>Shelf location</label><input value={form.shelf_location} onChange={set('shelf_location')} placeholder="e.g. B-03" /></div>
          <div className="field"><label>Rating (0–5)</label><input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={set('rating')} /></div>
        </div>
        <div className="field"><label>Description</label><textarea value={form.description} onChange={set('description')} /></div>
        <label className="check"><input type="checkbox" checked={form.is_bestseller} onChange={set('is_bestseller')} /> Bestseller</label>
        <button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add book'}</button>
      </form>

      <div>
        <h3 style={{ marginBottom: 12 }}>Catalog ({books.length})</h3>
        <div className="grid">
          {books.slice(0, 12).map((b) => <BookCard key={b.book_id} book={b} />)}
        </div>
      </div>
    </div>
  );
}