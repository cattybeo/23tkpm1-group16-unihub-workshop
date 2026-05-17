import app from './app.ts';
import { initCronJobs } from './workers/cron-jobs.ts';

const PORT = process.env.PORT || 3000;
initCronJobs();

const server = app.listen(PORT, () => {
  console.log(`
  🚀 UniHub Workshop Backend is running!
          Port: ${PORT}
          Env:  ${process.env.NODE_ENV}
  `);
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('HTTP server closed');
  });
});