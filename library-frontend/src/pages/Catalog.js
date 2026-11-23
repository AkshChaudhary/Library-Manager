import { useMemo, useState } from 'react';
import BookCard from '../components/BookCard';
import FilterBar from '../components/FilterBar';
import ReadPreviewModal from '../components/ReadPreviewModal';
import { SkeletonGrid } from '../components/Skeleton';

const DEFAULT_FILTERS = {
  search: '',
  status: 'all',
  format: 'all',
  category: 'all',
  sort: 'title',
};

export default function CatalogPage({ books, categories, loading }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [preview, setPreview] = useState(null);

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();

    const list = books.filter((b) => {
      if (filters.status !== 'all' && b.status !== filters.status) return false;
      if (filters.format !== 'all' && b.format !== filters.format) return false;
      if (filters.category !== 'all' && String(b.category_id) !== filters.category) return false;
      if (q && !`${b.title} ${b.author} ${b.isbn}`.toLowerCase().includes(q)) return false;
      return true;
    });

    return [...list].sort((a, b) =>
      filters.sort === 'newest'
        ? new Date(b.created_at) - new Date(a.created_at)
        : a.title.localeCompare(b.title)
    );
  }, [books, filters]);

  return (
    <section>
      <div className="page-header">
        <h2>Catalog</h2>
        <span className="muted">
          {loading ? 'Loading…' : `${visible.length} of ${books.length} titles`}
        </span>
      </div>

      <FilterBar filters={filters} setFilters={setFilters} categories={categories} />

      {loading ? (
        <SkeletonGrid />
      ) : visible.length === 0 ? (
        <div className="card empty">No books match these filters.</div>
      ) : (
        <div className="grid">
          {visible.map((book) => (
            <BookCard key={book.book_id} book={book} onPreview={setPreview} />
          ))}
        </div>
      )}

      <ReadPreviewModal book={preview} onClose={() => setPreview(null)} />
    </section>
  );
}