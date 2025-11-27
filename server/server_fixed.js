// Simple wrapper to use full kocmoc server logic.
// This file is kept as main entrypoint for pm2 / npm, but delegates to server.js.
require('dotenv').config();
const app = require('./server');

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server (wrapper) started on port ${port}`);
  });
}

module.exports = app;
