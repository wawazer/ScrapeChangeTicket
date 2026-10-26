import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { reportTicket } from './parsers.js';

const rows = [
  ['Date', 'date'], ['Ticket Number', 'ticket_number'], ['Requestor', 'requestor'], ['NIPP/NRK', 'nipp_nrk'],
  ['Contact', 'contact'], ['Email', 'email'], ['Location', 'location'], ['Application', 'application'],
  ['Change', 'change'], ['IP Address Server', 'ip_address_server'], ['Version', 'version'], ['Directory', 'directory'],
  ['PIC', 'pic'], ['Description', 'description'], ['Result', 'result'], ['Cause', 'cause'], ['Action Plan', 'action_plan']
];

function addHeader(doc, period, pageNumber) {
  doc.font('Helvetica-Bold').fontSize(12).text('PT PELABUHAN INDONESIA', { align: 'center' });
  doc.moveDown(0.25).fontSize(15).text('LAPORAN PATCH RELEASE', { align: 'center' });
  doc.font('Helvetica').fontSize(9).text(`Periode: ${period || '-'}`, { align: 'center' });
  doc.moveDown(0.7).moveTo(42, 94).lineTo(553, 94).strokeColor('#9ca3af').stroke();
  doc.fontSize(8).fillColor('#6b7280').text(`Halaman ${pageNumber}`, 42, 770, { align: 'right', width: 511 });
  doc.fillColor('#111827');
}

function addLabelValue(doc, label, value, y) {
  const labelWidth = 128; const valueWidth = 360;
  doc.font('Helvetica-Bold').fontSize(8.5).text(label, 52, y, { width: labelWidth });
  doc.font('Helvetica').fontSize(8.5).text(String(value || '-'), 185, y, { width: valueWidth, lineGap: 2 });
  const height = Math.max(doc.heightOfString(label, { width: labelWidth }), doc.heightOfString(String(value || '-'), { width: valueWidth, lineGap: 2 }));
  doc.moveTo(48, y + height + 5).lineTo(547, y + height + 5).strokeColor('#d1d5db').stroke();
  return y + height + 9;
}

export async function generatePdf(run, outputPath, options = {}) {
  const selected = options.ticketNumbers?.length ? run.tickets.filter((ticket) => options.ticketNumbers.includes(ticket.nomor_tiket)) : run.tickets;
  await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    stream.on('finish', resolve); stream.on('error', reject); doc.pipe(stream);
    selected.forEach((ticket, index) => {
      if (index) doc.addPage();
      addHeader(doc, options.period || run.metadata.filter_name, index + 1);
      let y = 110;
      const data = reportTicket(ticket, options.overrides?.[ticket.nomor_tiket]);
      for (const [label, key] of rows) {
        if (y > 735) { doc.addPage(); addHeader(doc, options.period || run.metadata.filter_name, index + 1); y = 110; }
        y = addLabelValue(doc, label, data[key], y);
      }
      if (options.screenshots?.[ticket.nomor_tiket]) {
        const image = options.screenshots[ticket.nomor_tiket];
        if (fs.existsSync(image)) { doc.addPage(); addHeader(doc, options.period || run.metadata.filter_name, index + 1); doc.image(image, 52, 115, { fit: [490, 610], align: 'center', valign: 'center' }); }
      }
    });
    if (!selected.length) { addHeader(doc, options.period || run.metadata.filter_name, 1); doc.fontSize(10).text('Tidak ada tiket untuk dilaporkan.', 52, 120); }
    doc.end();
  });
}
