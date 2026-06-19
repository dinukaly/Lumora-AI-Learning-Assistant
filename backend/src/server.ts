import app from './app.js';
import { config } from './config/index.js';
import { connectDB } from './config/db.js';
import './common/queue/worker.js';

const startServer = async () => {
  // Connect to Database
  await connectDB();

  const PORT = config.port;

  app.listen(PORT, () => {
    console.log(`Server running in ${config.env} mode on port ${PORT}`);
  });
};

startServer();
