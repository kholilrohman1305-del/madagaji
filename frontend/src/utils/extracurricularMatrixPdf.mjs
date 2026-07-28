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

function lineHeight(fontSize, multiplier = 1.15) {
  return fontSize * 0.3528 * multiplier;
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
  const availableRowsHeight = pageHeight - tableY - headerHeight - footerSpace;
  const colorMap = buildExtraColorMap(scheduledRows);
  const matrix = new Map();
  scheduledRows.forEach((row) => {
    const key = `${row.day}|${row.startTime}-${row.endTime}`;
    if (!matrix.has(key)) matrix.set(key, []);
    matrix.get(key).push(row);
  });

  function estimatedTileHeight(item) {
    const innerWidth = Math.max(4, slotWidth - 6);
    const nameSize = Math.max(5.8, Math.min(7.8, slotWidth * 0.28));
    const detailSize = Math.max(4.8, nameSize - 1.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(nameSize);
    const nameLines = doc.splitTextToSize(String(item.name || '-'), innerWidth);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(detailSize);
    const teacherLines = doc.splitTextToSize(`Guru: ${String(item.teacherName || '-')}`, innerWidth);
    return 3.4
      + (nameLines.length * lineHeight(nameSize))
      + lineHeight(detailSize)
      + (teacherLines.length * lineHeight(detailSize));
  }

  const desiredRowHeights = DAYS.map((day) => {
    const densestCell = timeSlots.reduce((maximum, slot) => {
      const items = matrix.get(`${day}|${slot}`) || [];
      const height = items.reduce((sum, item) => sum + estimatedTileHeight(item), 0)
        + Math.max(0, items.length - 1);
      return Math.max(maximum, height);
    }, 0);
    return Math.max(14, densestCell + 2);
  });
  const desiredHeightTotal = desiredRowHeights.reduce((sum, height) => sum + height, 0);
  const rowHeights = desiredHeightTotal <= availableRowsHeight
    ? desiredRowHeights.map((height) => height + ((availableRowsHeight - desiredHeightTotal) / DAYS.length))
    : desiredRowHeights.map((height) => height * (availableRowsHeight / desiredHeightTotal));

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

  let currentRowY = tableY + headerHeight;
  DAYS.forEach((day, dayIndex) => {
    const rowHeight = rowHeights[dayIndex];
    const y = currentRowY;
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
      const items = matrix.get(`${day}|${slot}`) || [];
      if (!items.length) {
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        drawCenteredText(doc, '-', x, y + (rowHeight / 2) + 1, slotWidth);
        return;
      }

      const gap = 1;
      const availableHeight = rowHeight - 2;
      const tileHeight = (availableHeight - ((items.length - 1) * gap)) / items.length;
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
        const badgeText = `${Number(item.meetings || 0)} jurnal`;
        let detailSize = Math.max(4.2, Math.min(6.4, slotWidth * 0.22));
        let nameSize = Math.min(8.2, detailSize + 1.4);
        let nameLines = [];
        let teacherLines = [];
        let badgeWidth = 0;
        let contentHeight = Number.POSITIVE_INFINITY;

        while (true) {
          nameSize = detailSize + 1.4;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(nameSize);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(Math.max(2.8, detailSize - 0.2));
          badgeWidth = doc.getTextWidth(badgeText) + 2.2;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(nameSize);
          nameLines = doc.splitTextToSize(
            String(item.name || '-'),
            Math.max(3, textWidth - badgeWidth - 1)
          );
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(detailSize);
          teacherLines = doc.splitTextToSize(
            `Guru: ${String(item.teacherName || '-')}`,
            textWidth
          );
          contentHeight = 2.6
            + (nameLines.length * lineHeight(nameSize))
            + lineHeight(detailSize)
            + (teacherLines.length * lineHeight(detailSize));
          if (contentHeight <= tileHeight || detailSize <= 2.8) break;
          detailSize = Math.max(2.8, detailSize - 0.2);
        }

        const nameLineHeight = lineHeight(nameSize);
        const detailLineHeight = lineHeight(detailSize);
        const nameY = tileY + 2.1 + nameLineHeight;
        doc.setTextColor(...color.inkRgb);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(nameSize);
        doc.text(nameLines, textX, nameY);

        doc.setFillColor(...color.solidRgb);
        doc.roundedRect(
          x + slotWidth - badgeWidth - 1.5,
          tileY + 1.3,
          badgeWidth,
          Math.max(3, lineHeight(Math.max(2.8, detailSize - 0.2)) + 1.4),
          1,
          1,
          'F'
        );
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.max(2.8, detailSize - 0.2));
        doc.text(
          badgeText,
          x + slotWidth - (badgeWidth / 2) - 1.5,
          tileY + 1.3 + Math.max(2.3, lineHeight(detailSize)),
          { align: 'center' }
        );

        let cursorY = nameY + (Math.max(1, nameLines.length) - 1) * nameLineHeight;
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(detailSize);
        doc.text(
          `Jam: ${timeLabel(item.startTime)} - ${timeLabel(item.endTime)}`,
          textX,
          cursorY + detailLineHeight
        );
        cursorY += detailLineHeight;
        doc.setFont('helvetica', 'normal');
        doc.text(teacherLines, textX, cursorY + detailLineHeight);
      });
    });
    currentRowY += rowHeight;
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
