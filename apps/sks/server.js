require('dotenv').config({ quiet: true });

const { createApp } = require('./src/app');

if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
        throw new Error('SESSION_SECRET is required (>= 32 chars) when NODE_ENV=production');
    }
}

const app = createApp();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
});
