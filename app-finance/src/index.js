require('dotenv').config();
const app = require('./app');

const port = Number(process.env.PORT || 4300);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`app-finance listening on ${port}`);
});
