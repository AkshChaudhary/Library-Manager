const STATUSES = ['all', 'available', 'issued', 'reserved'];
const FORMATS = [
  { value: 'all', label: 'All formats' },
  { value: 'physical', label: 'Physical' },
  { value: 'ebook', label: 'Digital' },
];

export default function FilterBar({ filters, setFilters, categories }) {
  const update = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  return (
    <div className="filter-bar glass">
      <input
        className="search"
        type="search"
        placeholder="Search by title, author or ISBN…"
        value={filters.search}
        onChange={update('search')}
        aria-label="Search books"
      />

      <div className="chip-group" role="group" aria-label="Availability">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`chip ${filters.status === s ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, status: s })}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="chip-group" role="group" aria-label="Format">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            className={`chip ${filters.format === f.value ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, format: f.value })}
          >
            {f.label}
          </button>
        ))}
      </div>

      <select value={filters.category} onChange={update('category')} aria-label="Genre">
        <option value="all">All genres</option>
        {categories.map((c) => (
          <option key={c.category_id} value={String(c.category_id)}>
            {c.name}
          </option>
        ))}
      </select>

      <select value={filters.sort} onChange={update('sort')} aria-label="Sort">
        <option value="title">Title A–Z</option>
        <option value="newest">Newest</option>
      </select>
    </div>
  );
}