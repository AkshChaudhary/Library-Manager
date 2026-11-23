import { useMemo, useState } from 'react';
import StatsCard from '../components/StatsCard';
import BookCard from '../components/BookCard';
import RecommendationRow from '../components/RecommendationRow';
import ReadPreviewModal from '../components/ReadPreviewModal';
import { SkeletonGrid } from '../components/Skeleton';
import { formatDate, formatMoney, previewFine } from '../utils/fines';

export default function DashboardPage({ data, role, memberId, loading }) {
  const [preview, setPreview] = useState(null);

  const { books, users, issues, reservations, returns } = data;

  const stats = useMemo(() => {
    const active = issues.filter((i) => i.status !== 'completed');
    const mine = (row) => String(row.user_id) === String(memberId);

    const myActive = active.filter(mine);
    const myOverdue = myActive.filter((i) => i.status === 'overdue');
    const myHolds = reservations.filter(
      (r) => mine(r) && ['pending', 'waitlisted'].includes(r.status)
    );

    const issueOwner = {};
    issues.forEach((i) => {
      issueOwner[String(i.issue_id)] = String(i.user_id);
    });
    const myFines = returns
      .filter((r) => issueOwner[String(r.issue_id)] === String(memberId))
      .reduce((sum, r) => sum + Number(r.fine_amount || 0), 0);

    return {
      active,
      overdueAll: active.filter((i) => i.status === 'overdue'),
      librarian: [
        { icon: '📚', label: 'Total titles', value: books.length, accent: '#6366f1' },
        { icon: '👥', label: 'Members & staff', value: users.length, accent: '#8b5cf6' },
        { icon: '✅', label: 'Available', value: books.filter((b) => b.status === 'available').length, accent: '#16a34a' },
        { icon: '📤', label: 'Issued', value: books.filter((b) => b.status === 'issued').length, accent: '#d97706' },
        { icon: '🔁', label: 'Active loans', value: active.length, accent: '#0ea5e9' },
        { icon: '⚠️', label: 'Overdue', value: active.filter((i) => i.status === 'overdue').length, accent: '#dc2626' },
      ],
      member: [
        { icon: '📖', label: 'My active loans', value: myActive.length, accent: '#6366f1' },
        { icon: '🔖', label: 'My holds', value: myHolds.length, accent: '#0ea5e9' },
        { icon: '⚠️', label: 'My overdue', value: myOverdue.length, accent: '#dc2626' },
        { icon: '💵', label: 'Fines recorded', value: formatMoney(myFines), accent: '#d97706' },
      ],
    };
  }, [books, users, issues, reservations, returns, memberId]);

  if (loading) return <SkeletonGrid count={4} />;

  const recent = [...books]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 4);

  return (
    <section>
      <div className="card hero">
        <h2>Welcome back</h2>
        <p className="muted">
          {role === 'librarian' ? 'Librarian overview' : 'Your library at a glance'}
        </p>
      </div>

      <div className="stats">
        {(role === 'librarian' ? stats.librarian : stats.member).map((s) => (
          <StatsCard key={s.label} {...s} />
        ))}
      </div>

      <RecommendationRow books={books} issues={issues} memberId={memberId} onPreview={setPreview} />

      {role === 'librarian' && (
        <>
          <h3 className="section-title">Overdue loans</h3>
          <div className="card">
            {stats.overdueAll.length === 0 ? (
              <p className="muted">No overdue loans. 🎉</p>
            ) : (
              stats.overdueAll.map((i) => {
                const fine = previewFine(i.due_at);
                return (
                  <div className="list-row" key={i.issue_id}>
                    <span>
                      <strong>{i.book_title}</strong> · {i.user_name}
                    </span>
                    <span className="muted small">
                      Due {formatDate(i.due_at)} · fine so far {formatMoney(fine.amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      <h3 className="section-title">Recently added</h3>
      <div className="grid">
        {recent.map((book) => (
          <BookCard key={book.book_id} book={book} onPreview={setPreview} />
        ))}
      </div>

      <ReadPreviewModal book={preview} onClose={() => setPreview(null)} />
    </section>
  );
}