import { buildExtraColorMap, colorForExtra } from './extracurricularColors.mjs';

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function periodLabel(period) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || ''));
  if (!match) return String(period || '-');
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function timeLabel(value) {
  return String(value || '').slice(0, 5);
}

function drawCenteredText(doc, text, x, y, width) {
  doc.text(String(text || ''), x + (width / 2), y, { align: 'center' });
}

export async function createExtracurricularMatrixPdf(rows = [], period = '') {
  const scheduledRows = rows.filter((row) => (
    DAYS.includes(row.day) && row.startTime && row.endTime
  ));
  const timeSlots = [...new Set(scheduledRows.map(
    (row) => `${row.startTime}-${row.endTime}`
  ))].sort((left, right) => left.localeCompare(right));
  if (!timeSlots.length) throw new Error('Belum ada slot waktu yang dapat dibuat menjadi PDF.');

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [210, 330],
    compress: true,
    putOnlyUsedFonts: true
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;
  const dayWidth = 22;
  const tableWidth = pageWidth - (margin * 2);
  const slotWidth = (tableWidth - dayWidth) / timeSlots.length;
  const titleY = 10;
  const tableY = 27;
  const headerHeight = 14;
  const footerSpace = 8;
  const rowHeight = (pageHeight - tableY - headerHeight - footerSpace) / DAYS.length;
  const colorMap = buildExtraColorMap(scheduledRows);

  doc.setProperties({
    title: `Matriks Jadwal Ekstrakurikuler - ${periodLabel(period)}`,
    subject: 'Matriks jadwal mingguan ekstrakurikuler',
    author: 'MadaFlow'
  });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.text('MATRIKS JADWAL EKSTRAKURIKULER', margin, titleY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5);
  doc.text(`Periode ${periodLabel(period)}  |  ${scheduledRows.length} kegiatan aktif`, margin, titleY + 5);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1.1);
  doc.line(margin, titleY + 9, pageWidth - margin, titleY + 9);

  doc.setFillColor(15, 37, 84);
  doc.rect(margin, tableY, tableWidth, headerHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  drawCenteredText(doc, 'HARI', margin, tableY + 8.5, dayWidth);
  timeSlots.forEach((slot, index) => {
    const [start, end] = slot.split('-');
    const x = margin + dayWidth + (index * slotWidth);
    doc.setDrawColor(59, 80, 132);
    doc.rect(x, tableY, slotWidth, headerHeight);
    doc.setFontSize(Math.max(6.2, Math.min(8.5, slotWidth * 0.34)));
    drawCenteredText(doc, `${timeLabel(start)} - ${timeLabel(end)}`, x, tableY + 8.5, slotWidth);
  });

  DAYS.forEach((day, dayIndex) => {
    const y = tableY + headerHeight + (dayIndex * rowHeight);
    doc.setFillColor(dayIndex % 2 ? 248 : 241, dayIndex % 2 ? 250 : 245, dayIndex % 2 ? 252 : 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, tableWidth, rowHeight, 'FD');
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, dayWidth, rowHeight, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    drawCenteredText(doc, day.toUpperCase(), margin, y + (rowHeight / 2) + 1.5, dayWidth);

    timeSlots.forEach((slot, slotIndex) => {
      const x = margin + dayWidth + (slotIndex * slotWidth);
      doc.setDrawColor(203, 213, 225);
      doc.rect(x, y, slotWidth, rowHeight);
      const items = scheduledRows.filter(
        (row) => row.day === day && `${row.startTime}-${row.endTime}` === slot
      );
      if (!items.length) return;

      const gap = 1;
      const availableHeight = rowHeight - 2;
      const tileHeight = Math.max(4.8, (availableHeight - ((items.length - 1) * gap)) / items.length);
      items.forEach((item, itemIndex) => {
        const tileY = y + 1 + (itemIndex * (tileHeight + gap));
        const color = colorForExtra(item, colorMap);
        doc.setFillColor(...color.softRgb);
        doc.setDrawColor(...color.solidRgb);
        doc.setLineWidth(0.25);
        doc.roundedRect(x + 1, tileY, slotWidth - 2, tileHeight, 1.2, 1.2, 'FD');
        doc.setFillColor(...color.solidRgb);
        doc.rect(x + 1, tileY, 1.3, tileHeight, 'F');

        const textX = x + 3.2;
        const textWidth = Math.max(4, slotWidth - 5);
        const nameSize = Math.max(5.5, Math.min(8.2, slotWidth * 0.3, tileHeight * 0.5));
        doc.setTextColor(...color.inkRgb);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(nameSize);
        const nameLines = doc.splitTextToSize(String(item.name || '-'), textWidth);
        const canShowTeacher = tileHeight >= 9.5;
        const maxNameLines = canShowTeacher ? 1 : Math.max(1, Math.floor(tileHeight / (nameSize * 0.42)));
        doc.text(nameLines.slice(0, maxNameLines), textX, tileY + 3.5, {
          baseline: 'middle',
          maxWidth: textWidth
        });
        if (canShowTeacher) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(Math.max(4.8, nameSize - 1.2));
          doc.setTextColor(71, 85, 105);
          const teacher = doc.splitTextToSize(String(item.teacherName || '-'), textWidth)[0];
          doc.text(teacher, textX, tileY + tileHeight - 2.1, { maxWidth: textWidth });
        }
      });
    });
  });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6.5);
  doc.text('Sumber: Jadwal Ekstrakurikuler MadaFlow', margin, pageHeight - 3.2);
  doc.text('F4 landscape - 1 lembar', pageWidth - margin, pageHeight - 3.2, { align: 'right' });
  return doc;
}

export async function downloadExtracurricularMatrixPdf(rows, period) {
  const doc = await createExtracurricularMatrixPdf(rows, period);
  doc.save(`matriks-jadwal-ekstrakurikuler-${period || 'periode'}.pdf`);
}
