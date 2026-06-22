import app from './app.js';
import { config } from './config/index.js';
import { connectDB } from './config/db.js';

const startServer = async () => {
  // Connect to Database
  await connectDB();
  await import('./common/queue/worker.js');

  const PORT = config.port;

  app.listen(PORT, () => {
    console.log(`Server running in ${config.env} mode on port ${PORT}`);
  });
};

startServer();
