require('dotenv').config();
const app = require('./app');

const port = Number(process.env.PORT || 4100);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`app-core listening on port ${port}`);
});
