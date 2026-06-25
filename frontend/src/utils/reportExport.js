function safeSheetName(name) {
  return String(name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportXlsx(filename, sheets) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MadaFlow';
  workbook.created = new Date();

  sheets.forEach((sheet) => {
    const rows = sheet.rows?.length ? sheet.rows : [['Tidak ada data']];
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name));
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    worksheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, (cell) => {
        maxLength = Math.max(maxLength, String(cell.value ?? '').length);
      });
      column.width = Math.min(Math.max(maxLength + 2, 12), 45);
    });
  });

  const outputName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(outputName, new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
}

export async function exportPdf(filename, title, sections) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, pageWidth / 2, 14, { align: 'center' });

  let y = 24;
  sections.forEach((section, index) => {
    if (index > 0 && y > 155) {
      doc.addPage();
      y = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(section.title, 14, y);
    y += 4;

    const [head, ...body] = section.rows?.length ? section.rows : [['Info'], ['Tidak ada data']];
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
