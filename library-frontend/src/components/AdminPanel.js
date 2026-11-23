import { post } from '../api';

export default function AdminPanel({ categories, notify, refresh }) {
  const formValues = (form) => Object.fromEntries(new FormData(form));

  const submitBook = async (e) => {
    e.preventDefault();
    const f = formValues(e.currentTarget);
    try {
      await post('/books', {
        title: f.title,
        author: f.author,
        isbn: f.isbn,
        category_id: Number(f.category_id),
        publisher: f.publisher,
        publication_year: f.publication_year ? Number(f.publication_year) : null,
        format: f.format,
        shelf_location: f.shelf_location,
        description: f.description,
        cover_url: f.cover_url,
        rating: f.rating ? Number(f.rating) : null,
        is_bestseller: f.is_bestseller === 'on',
      });
      notify('success', 'Book added to the catalog.');
      e.currentTarget.reset();
      await refresh();
    } catch (err) {
      notify('error', err.message);
    }
  };

  const submitCategory = async (e) => {
    e.preventDefault();
    const f = formValues(e.currentTarget);
    try {
      await post('/categories', { name: f.name, description: f.description });
      notify('success', `Genre "${f.name}" created.`);
      e.currentTarget.reset();
      await refresh();
    } catch (err) {
      notify('error', err.message);
    }
  };

  const submitMember = async (e) => {
    e.preventDefault();
    const f = formValues(e.currentTarget);
    try {
      await post('/users', { full_name: f.full_name, email: f.email, phone: f.phone });
      notify('success', `Member ${f.full_name} added.`);
      e.currentTarget.reset();
      await refresh();
    } catch (err) {
      notify('error', err.message);
    }
  };

  return (
    <section>
      <div className="page-header">
        <h2>⚙️ Admin</h2>
      </div>

      <div className="admin-grid">
        <form className="card form" onSubmit={submitBook}>
          <h3>Add a book</h3>
          <div className="form-grid">
            <div className="field"><label>Title *</label><input name="title" required /></div>
            <div className="field"><label>Author *</label><input name="author" required /></div>
            <div className="field"><label>ISBN *</label><input name="isbn" required placeholder="e.g. 9780140449136" /></div>
            <div className="field">
              <label>Genre *</label>
              <select name="category_id" required defaultValue="">
                <option value="" disabled>Choose a genre</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={String(c.category_id)}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field"><label>Publisher</label><input name="publisher" /></div>
            <div className="field"><label>Year</label><input name="publication_year" type="number" /></div>
            <div className="field">
              <label>Format</label>
              <select name="format" defaultValue="physical">
                <option value="physical">Physical</option>
                <option value="ebook">Digital (e-book)</option>
              </select>
            </div>
            <div className="field"><label>Shelf location</label><input name="shelf_location" placeholder="e.g. B-03" /></div>
            <div className="field"><label>Rating (0–5)</label><input name="rating" type="number" step="0.1" min="0" max="5" /></div>
            <div className="field"><label>Cover image URL</label><input name="cover_url" placeholder="Optional" /></div>
          </div>
          <div className="field"><label>Description</label><textarea name="description" /></div>
          <label className="check"><input type="checkbox" name="is_bestseller" /> Mark as bestseller</label>
          <button className="btn">Add book</button>
        </form>

        <div className="card">
          <form className="form" onSubmit={submitCategory} style={{ maxWidth: 'none', marginBottom: 24 }}>
            <h3>Add a genre</h3>
            <div className="field"><label>Name *</label><input name="name" required /></div>
            <div className="field"><label>Description</label><input name="description" /></div>
            <button className="btn">Add genre</button>
          </form>

          <form className="form" onSubmit={submitMember} style={{ maxWidth: 'none' }}>
            <h3>Add a member</h3>
            <div className="field"><label>Full name *</label><input name="full_name" required /></div>
            <div className="field"><label>Email *</label><input name="email" type="email" required /></div>
            <div className="field"><label>Phone</label><input name="phone" /></div>
            <button className="btn">Add member</button>
          </form>

          <h3 style={{ margin: '24px 0 10px' }}>Existing genres</h3>
          {categories.map((c) => (
            <div className="list-row" key={c.category_id}>
              <span>{c.name}</span>
              <span className="muted small">{c.book_count} book(s)</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}