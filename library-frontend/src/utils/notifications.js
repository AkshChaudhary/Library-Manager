import { formatMoney, previewFine } from './fines';

// Builds the bell list from the data already loaded. Nothing is stored.
export function buildNotifications(data, role, memberId) {
  const items = [];
  const mine = (row) => String(row.user_id) === String(memberId);

  if (role === 'librarian') {
    data.issues
      .filter((i) => i.status === 'overdue')
      .forEach((i) =>
        items.push({
          id: `overdue-${i.issue_id}`,
          level: 'warn',
          text: `Overdue: "${i.book_title}" held by ${i.user_name}`,
        })
      );
  }

  data.issues
    .filter((i) => i.status !== 'completed' && mine(i))
    .forEach((i) => {
      if (i.status === 'overdue') {
        const fine = previewFine(i.due_at);
        items.push({
          id: `mine-overdue-${i.issue_id}`,
          level: 'danger',
          text: `"${i.book_title}" is overdue. Current fine: ${formatMoney(fine.amount)}.`,
        });
      } else if (new Date(i.due_at).getTime() - Date.now() < 2 * 86400000) {
        items.push({
          id: `due-${i.issue_id}`,
          level: 'warn',
          text: `"${i.book_title}" is due within 2 days.`,
        });
      }
    });

  data.reservations
    .filter((r) => mine(r))
    .forEach((r) => {
      if (r.status === 'pending' && r.notified_at) {
        items.push({
          id: `ready-${r.reservation_id}`,
          level: 'success',
          text: `Your hold on "${r.book_title}" is ready to collect.`,
        });
      }
      if (r.status === 'waitlisted') {
        items.push({
          id: `wait-${r.reservation_id}`,
          level: 'info',
          text: `You are on the waitlist for "${r.book_title}".`,
        });
      }
    });

  const issueOwner = {};
  data.issues.forEach((i) => {
    issueOwner[String(i.issue_id)] = String(i.user_id);
  });
  data.returns
    .filter((r) => issueOwner[String(r.issue_id)] === String(memberId) && Number(r.fine_amount) > 0)
    .forEach((r) =>
      items.push({
        id: `fine-${r.return_id}`,
        level: 'warn',
        text: `Late-return fine recorded: ${formatMoney(r.fine_amount)}.`,
      })
    );

  return items;
}