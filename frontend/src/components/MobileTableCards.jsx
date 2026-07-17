import { useEffect } from 'react';

// Mengubah semua tabel data (.table) menjadi kartu bertumpuk di layar mobile
// supaya tidak perlu scroll kiri-kanan: label kolom dibaca dari <thead> lalu
// ditulis ke tiap <td> sebagai data-mb-label, CSS .table.mb-cards yang
// menata ulang tampilannya (lihat app.css bagian "Tabel jadi kartu").
//
// Dikecualikan: matriks jadwal (.teacher-sheet), dokumen cetak/slip, tabel
// kehadiran (punya tampilan mobile khusus), dan tabel dengan data-mb-skip.
const EXCLUDE_CLOSEST = '.teacher-sheet, .cetak-bisyaroh-document, .slip-card, .print-only';

function annotate() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;
  document.querySelectorAll('table.table').forEach((table) => {
    if (table.classList.contains('attendance-table')) return;
    if (table.dataset.mbSkip !== undefined) return;
    if (table.closest(EXCLUDE_CLOSEST)) return;

    const ths = table.querySelectorAll(':scope > thead th');
    if (!ths.length) return;
    const labels = Array.from(ths).map((th) => th.textContent.trim());

    table.querySelectorAll(':scope > tbody > tr').forEach((tr) => {
      let col = 0;
      Array.from(tr.children).forEach((td) => {
        const span = td.colSpan || 1;
        if (span === 1 && labels[col]) td.setAttribute('data-mb-label', labels[col]);
        col += span;
      });
    });
    table.classList.add('mb-cards');
  });
}

export default function MobileTableCards() {
  useEffect(() => {
    annotate();
    let raf = 0;
    // childList saja (bukan attributes) supaya setAttribute/classList milik
    // annotate tidak memicu loop observer.
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(annotate);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => annotate();
    mq.addEventListener('change', onChange);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      mq.removeEventListener('change', onChange);
    };
  }, []);
  return null;
}
