// js/print-helper.js

async function printReceipt(paymentId) {
    try {
        // 1. Ambil Data Pembayaran
        const payment = await apiCall(`/api/payments/${paymentId}`);
        if (!payment) return alert("Data pembayaran tidak ditemukan.");

        // 2. Ambil Data Pengaturan Sekolah (Cek Global State dulu, kalau kosong baru fetch)
        let settings = appData.settings;
        if (!settings) {
            settings = await apiCall('/api/settings');
            appData.settings = settings; // Simpan ke cache
        }

        // Default value jika kosong
        const sekolah = settings.nama_sekolah || "SKS ADMIN";
        const alamat = settings.alamat_sekolah || "-";
        const kontak = [settings.telepon, settings.email].filter(Boolean).join(' | ');
        const footerNote = settings.footer_kwitansi || "Simpan tanda terima ini sebagai bukti pembayaran yang sah.";

        // Format Data
        const tgl = new Date(payment.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        const terbilang = katakan(payment.jumlah_bayar) + " Rupiah";
        const qrPayload = payment.qr_payload || `SKS|TRX:${payment.trans_id}|DATE:${payment.tanggal}|NAME:${payment.nama}|CLASS:${payment.kelas}|AMOUNT:${Number(payment.jumlah_bayar)}`;
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrPayload)}`;

        const operatorName = (typeof window.getCurrentOperatorName === 'function')
            ? await window.getCurrentOperatorName()
            : ((window.appData && window.appData.admin && window.appData.admin.nama_lengkap)
                ? String(window.appData.admin.nama_lengkap).trim()
                : 'Admin');

        // HTML Kwitansi (desain lama + ukuran tetap 21cm x 9cm)
        const receiptWindow = window.open('', '', 'width=1000,height=700');
        const content = `
        <html>
        <head>
            <title>Bukti Pembayaran - ${payment.trans_id}</title>
            <style>
                @page { size: 20cm 9cm; margin: 0; }
                body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 0; color: #000; width: 20cm; height: 9cm; }
                .print-wrap { width: 20cm; height: 9cm; padding: 6mm; box-sizing: border-box; }
                .container { border: 2px solid #333; padding: 10px; position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; }
                .watermark { position: absolute; top: 52%; left: 50%; transform: translate(-50%, -50%) rotate(-16deg); font-size: 48px; color: rgba(0,0,0,0.03); font-weight: 700; border: 4px solid rgba(0,0,0,0.03); padding: 4px 18px; z-index: -1; white-space: nowrap; }
                .layout { display: grid; grid-template-columns: 1fr 96px; gap: 10px; height: 100%; }
                .left { display: flex; flex-direction: column; min-width: 0; }
                .right { display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding-left: 4px; border-left: 1px dashed #999; }
                .header { text-align: center; border-bottom: 2px double #333; padding-bottom: 4px; margin-bottom: 6px; }
                .school-name { font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: .8px; line-height: 1.1; }
                .address { font-size: 8px; margin-top: 2px; line-height: 1.2; }
                .title { text-align: center; font-size: 11px; font-weight: bold; text-decoration: underline; margin: 4px 0 6px; letter-spacing: .4px; }
                .row { display: flex; margin-bottom: 3px; font-size: 9px; line-height: 1.2; }
                .label { width: 90px; font-weight: bold; }
                .sep { width: 8px; text-align: center; }
                .value { flex: 1; border-bottom: 1px dotted #ccc; text-transform: uppercase; min-width: 0; }
                .amount-box { margin-top: 5px; padding: 6px 8px; border: 2px solid #000; font-weight: bold; font-size: 14px; display: inline-block; background: #f0f0f0; box-shadow: 1px 1px 0px #ccc; }
                .footer { margin-top: 6px; display: flex; gap: 8px; align-items: flex-end; }
                .signature-left { text-align: left; font-size: 8px; flex: 1; line-height: 1.25; }
                .signature-right { text-align: center; width: 160px; font-size: 8px; }
                .sign-line { margin-top: 18px; border-bottom: 1px solid #000; }
                .qr-box { text-align: center; }
                .qr-box img { width: 74px; height: 74px; border: 1px solid #ddd; padding: 3px; background: #fff; }
                .qr-caption { font-size: 8px; margin-top: 2px; text-align: center; line-height: 1.15; word-break: break-word; }
                @media print {
                    html, body { width: 20cm; height: 9cm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="print-wrap">
                <div class="container">
                    <div class="watermark">MA ABU DARRIN</div>
                    <div class="layout">
                        <div class="left">
                            <div class="header">
                                <div class="school-name">${sekolah}</div>
                                <div class="address">${alamat}${kontak ? `<br>${kontak}` : ''}</div>
                            </div>

                            <div class="title">BUKTI PEMBAYARAN</div>

                            <div class="row">
                                <div class="label">No. Transaksi</div><div class="sep">:</div>
                                <div class="value">${payment.trans_id}</div>
                            </div>
                            <div class="row">
                                <div class="label">Terima Dari</div><div class="sep">:</div>
                                <div class="value"><b>${payment.nama}</b> (Kelas ${payment.kelas})</div>
                            </div>
                            <div class="row">
                                <div class="label">Uang Sejumlah</div><div class="sep">:</div>
                                <div class="value" style="font-style:italic; text-transform: capitalize;"># ${terbilang} #</div>
                            </div>
                            <div class="row">
                                <div class="label">Guna Pembayaran</div><div class="sep">:</div>
                                <div class="value">${payment.keterangan || 'Pembayaran Sekolah'}</div>
                            </div>

                            <div class="amount-box">Rp ${Number(payment.jumlah_bayar).toLocaleString('id-ID')}</div>

                            <div class="footer">
                                <div class="signature-left">
                                    <b>Catatan:</b><br>
                                    ${footerNote}
                                </div>
                                <div class="signature-right">
                                    ${tgl}<br>
                                    Penerima,<br><br>
                                    <div class="sign-line"></div>
                                    ${operatorName || payment.penerima || 'Admin Keuangan'}
                                </div>
                            </div>
                        </div>

                        <div class="right">
                            <div class="qr-box">
                                <img src="${qrImageUrl}" alt="QR Transaksi ${payment.trans_id}" />
                                <div class="qr-caption">${payment.trans_id}</div>
                            </div>
                            <div class="qr-caption">${tgl}</div>
                        </div>
                    </div>
                </div>
            </div>
            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
        `;

        receiptWindow.document.write(content);
        receiptWindow.document.close();

    } catch (e) {
        console.error(e);
        alert("Gagal mencetak kwitansi.");
    }
}

// ... (Fungsi exportToExcel & katakan TETAP SAMA seperti sebelumnya) ...
function exportToExcel(dataArray, filename = 'Laporan.xlsx') {
    if (!dataArray || dataArray.length === 0) return alert("Tidak ada data untuk diexport.");
    const ws = XLSX.utils.json_to_sheet(dataArray);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan");
    XLSX.writeFile(wb, filename);
}

function katakan(nilai) {
    const angka = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
    let n = Math.floor(Math.abs(nilai));
    let hasil = "";
    if (n < 12) hasil = " " + angka[n];
    else if (n < 20) hasil = katakan(n - 10) + " Belas";
    else if (n < 100) hasil = katakan(n / 10) + " Puluh" + katakan(n % 10);
    else if (n < 200) hasil = " Seratus" + katakan(n - 100);
    else if (n < 1000) hasil = katakan(n / 100) + " Ratus" + katakan(n % 100);
    else if (n < 2000) hasil = " Seribu" + katakan(n - 1000);
    else if (n < 1000000) hasil = katakan(n / 1000) + " Ribu" + katakan(n % 1000);
    else if (n < 1000000000) hasil = katakan(n / 1000000) + " Juta" + katakan(n % 1000000);
    return hasil;
}
