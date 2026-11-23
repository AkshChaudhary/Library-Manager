const finesRoutes = require('./routes/fines');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { testConnection } = require('./db');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const booksRoutes = require('./routes/books');
const categoriesRoutes = require('./routes/categories');
const issuesRoutes = require('./routes/issues');
const returnsRoutes = require('./routes/returns');
const reservationsRoutes = require('./routes/reservations');

const app = express();
const port = process.env.PORT || 3000;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3001';

// Only your frontend may call the API, and it may send the login cookie.
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({
    message: 'Library Management System API is running',
    version: '2.1.0',
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/fines', finesRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', status: 404 });
});

app.use(errorHandler);

testConnection()
  .then((result) => {
    console.log('Database connected successfully:', result.current_time);
  })
  .catch((error) => {
    console.warn('Database connectivity check failed:', error.message);
  });

app.listen(port, () => {
  console.log(`Library backend server listening on port ${port}`);
});