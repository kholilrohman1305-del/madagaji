require('dotenv').config({ quiet: true });
const readline = require('readline');

async function main() {
    let google;
    try {
        ({ google } = require('googleapis'));
    } catch {
        throw new Error('Dependency "googleapis" belum terpasang. Jalankan: npm i googleapis');
    }

    const clientId = String(process.env.SKS_GOOGLE_DRIVE_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.SKS_GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
    const redirectUri = String(process.env.SKS_GOOGLE_DRIVE_REDIRECT_URI || 'http://127.0.0.1:53682/oauth2callback').trim();
    if (!clientId || !clientSecret) {
        throw new Error('Set SKS_GOOGLE_DRIVE_CLIENT_ID dan SKS_GOOGLE_DRIVE_CLIENT_SECRET di .env');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/drive.file']
    });

    console.log('\n=== Google Drive OAuth Token Helper ===');
    console.log('\n1) Buka URL ini di browser:');
    console.log(authUrl);
    console.log('\n2) Setelah approve, copy value parameter "code" dari URL callback.');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve));
    const code = String(await ask('\nPaste code di sini: ')).trim();
    rl.close();

    if (!code) throw new Error('Code kosong.');

    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
        throw new Error('Refresh token tidak didapat. Ulangi consent dengan prompt=consent atau revoke akses dulu.');
    }

    console.log('\nTambahkan ke .env:');
    console.log(`SKS_GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
}

main().catch((err) => {
    console.error('\nGagal:', err.message);
    process.exit(1);
});

