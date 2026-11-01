import path from 'node:path';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { isSysId, reportTicket } from './parsers.js';

const clean = (value) => {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  return text === '-' ? '' : text;
};

const pick = (...values) => values.map(clean).find((value) => value && !isSysId(value)) || '';

const COLUMNS = [
  { header: 'Nomor Tiket', key: 'nomor_tiket', width: 16 },
  { header: 'Created', key: 'created', width: 20 },
  { header: 'Change Request', key: 'change_request', width: 18 },
  { header: 'Judul Task', key: 'judul_task', width: 26 },
  { header: 'Judul Permasalahan', key: 'judul_permasalahan', width: 34 },
  { header: 'Assigned To', key: 'ditugaskan_kepada', width: 24 },
  { header: 'Configuration Item', key: 'configuration_item', width: 24 },
  { header: 'Task Type', key: 'tipe_task', width: 14 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Priority', key: 'prioritas', width: 10 },
  { header: 'Start Date', key: 'start_date', width: 20 },
  { header: 'End Date', key: 'end_date', width: 20 },
  { header: 'Requestor', key: 'requestor', width: 22 },
  { header: 'NIPP/NRK', key: 'nipp_nrk', width: 16 },
  { header: 'Contact', key: 'contact', width: 18 },
  { header: 'Email', key: 'email', width: 26 },
  { header: 'Location', key: 'location', width: 20 },
  { header: 'Application', key: 'application', width: 22 },
  { header: 'Change', key: 'change', width: 18 },
  { header: 'IP Address Server', key: 'ip_address_server', width: 20 },
  { header: 'Version', key: 'version', width: 16 },
  { header: 'Directory', key: 'directory', width: 24 },
  { header: 'PIC', key: 'pic', width: 22 },
  { header: 'Description', key: 'description', width: 60 },
  { header: 'Result', key: 'result', width: 12 },
  { header: 'Cause', key: 'cause', width: 40 },
  { header: 'Action Plan', key: 'action_plan', width: 40 }
];

const WRAPPED = new Set(['judul_task', 'judul_permasalahan', 'description', 'cause', 'action_plan']);

function rowFor(ticket, defaultResult) {
  const detail = ticket.detail_tiket || {};
  const table = ticket.data_tabel || {};
  const hasResult = clean(detail.result || ticket.report?.result);
  const report = reportTicket(ticket, !hasResult && defaultResult ? { result: defaultResult } : {});
  const status = detail.status && typeof detail.status === 'object'
    ? pick(detail.status.nama, detail.status.text, detail.status.kode)
    : pick(detail.status, table.status);
  return {
    nomor_tiket: ticket.nomor_tiket,
    created: pick(detail.created, table.created, table.tiket_dibuat, report.date),
    change_request: pick(detail.change_request, table.change_request, report.change),
    judul_task: pick(detail.judul_task, table.judul_task),
    judul_permasalahan: pick(detail.judul_permasalahan, table.judul_permasalahan),
    ditugaskan_kepada: pick(detail.ditugaskan_kepada, table.ditugaskan_kepada, detail.pic),
    configuration_item: pick(detail.configuration_item, table.configuration_item),
    tipe_task: pick(detail.tipe_task, table.tipe_task, table.task_type),
    status,
    prioritas: pick(detail.prioritas, table.prioritas),
    start_date: pick(detail.start_date, table.start_date),
    end_date: pick(detail.end_date, table.end_date),
    requestor: report.requestor,
    nipp_nrk: report.nipp_nrk,
    contact: report.contact,
    email: report.email,
    location: report.location,
    application: report.application,
    change: report.change,
    ip_address_server: report.ip_address_server,
    version: report.version,
    directory: report.directory,
    pic: report.pic,
    description: report.description,
    result: report.result,
    cause: report.cause,
    action_plan: report.action_plan
  };
}

export async function generateExcel(run, outputPath, options = {}) {
  const tickets = options.tickets || run.tickets;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ScrapeChangeTicket';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Patch Release', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  const header = sheet.getRow(1);
  header.height = 26;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4A6F' } };
  header.eachCell((cell) => { cell.border = { bottom: { style: 'thin', color: { argb: 'FFBFD3E0' } } }; });

  tickets.forEach((ticket) => {
    const row = sheet.addRow(rowFor(ticket, options.defaultResult));
    row.alignment = { vertical: 'top', wrapText: false };
    WRAPPED.forEach((key) => { row.getCell(key).alignment = { vertical: 'top', wrapText: true }; });
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  const info = workbook.addWorksheet('Info');
  info.columns = [{ width: 26 }, { width: 46 }];
  const metadata = run.metadata || {};
  [
    ['Sumber', metadata.source || 'ServiceNow Pelindo'],
    ['Filter ServiceNow', metadata.filter_name || '-'],
    ['Periode laporan', options.period || metadata.filter_name || '-'],
    ['Waktu scraping', metadata.scraped_at || '-'],
    ['Total ditemukan', metadata.total_found ?? tickets.length],
    ['Tiket diekspor', tickets.length],
    ['Berhasil diproses', metadata.success ?? '-'],
    ['Gagal diproses', metadata.failed ?? '-']
  ].forEach(([label, value]) => {
    const row = info.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}
