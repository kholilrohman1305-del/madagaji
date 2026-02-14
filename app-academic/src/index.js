require('dotenv').config();
const app = require('./app');

const port = Number(process.env.PORT || 4200);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`app-academic listening on ${port}`);
});
