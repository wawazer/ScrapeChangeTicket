/**
 * AI Duplicate & Recurring Issue Detection.
 *
 * Compares a target ticket against historical tickets using semantic LLM analysis.
 *
 * shortcut: prompt fits up to 10 historical candidates, truncate to prevent context blowout.
 */

import { createProvider, extractJson } from './provider.js';

const SYSTEM_PROMPT = `Anda adalah sistem analitik IT Service Management (ITSM) tingkat lanjut yang bertugas menganalisis duplikasi tiket insiden/change request (CTASK/CHG) dan deteksi pola insiden berulang.
Tugas Anda adalah membandingkan 1 tiket target dengan daftar tiket historis yang memiliki Configuration Item (CI) atau Application yang identik/relevan.

Aturan Output:
1. Kembalikan respons HANYA berupa JSON valid.
2. Dilarang menambahkan teks pengantar, penutup, atau pembungkus markdown (seperti \`\`\`json ... \`\`\`).
3. Evaluasi kemiripan berdasarkan: konteks masalah/perubahan, komponen teknis yang disentuh, dampak, dan aktivitas/langkah penyelesaian.
4. Nilai similarity_score harus berupa desimal antara 0.00 (tidak ada kemiripan) hingga 1.00 (duplikat identik/persis).`;

/**
 * Format prompt text for target ticket and candidates.
 */
export function formatDuplicatePrompt(targetTicket, historicalTickets) {
  const targetText = `### TIKET TARGET SAAT INI:
- Nomor Tiket    : ${targetTicket.number || targetTicket.nomor_tiket || '-'}
- Tipe Tiket     : ${targetTicket.type || (String(targetTicket.number || '').startsWith('CHG') ? 'CHG' : 'CTASK')}
- Judul/Ringkasan: ${targetTicket.short_description || targetTicket.ringkasan || targetTicket.deskripsi_singkat || '-'}
- CI / Aplikasi  : ${targetTicket.configuration_item || targetTicket.ci || '-'} / ${targetTicket.application || targetTicket.aplikasi || '-'}
- Deskripsi Utama: ${(targetTicket.description || targetTicket.deskripsi || '').slice(0, 500) || '-'}
- Pemohon / NIPP : ${targetTicket.requestor || targetTicket.pemohon || '-'} (${targetTicket.nipp || targetTicket.nipp_nrk || '-'})`;

  const historicalList = historicalTickets.slice(0, 10).map((t, idx) => `[Tiket #${idx + 1}]
- Nomor Tiket    : ${t.number || t.nomor_tiket || '-'}
- Tanggal Dibuat : ${t.created_at || t.tanggal_dibuat || t.start_date || '-'}
- Judul/Ringkasan: ${t.short_description || t.ringkasan || t.deskripsi_singkat || '-'}
- CI / Aplikasi  : ${t.configuration_item || t.ci || '-'} / ${t.application || t.aplikasi || '-'}
- Deskripsi Utama: ${(t.description || t.deskripsi || '').slice(0, 300) || '-'}
- Status Akhir   : ${t.state || t.status || 'Closed'}
---`).join('\n');

  return `${targetText}

### DAFTAR TIKET HISTORIS TERKAIT:
${historicalList || 'Tidak ada tiket historis untuk dibandingkan.'}

### STRUCTURAL JSON OUTPUT SCHEMA:
{
  "target_ticket_number": "${targetTicket.number || targetTicket.nomor_tiket || '-'}",
  "has_duplicates": boolean,
  "duplicates": [
    {
      "ticket_number": "string",
      "similarity_score": float,
      "match_level": "HIGH" | "MEDIUM" | "LOW",
      "is_recurring_issue": boolean,
      "reason": "string"
    }
  ],
  "recommendation": "string"
}`;
}

/**
 * Fallback heuristic duplicate check when LLM is unavailable.
 */
export function fallbackDuplicateCheck(targetTicket, historicalTickets) {
  const targetNumber = targetTicket.number || targetTicket.nomor_tiket || '-';
  const targetDesc = String(targetTicket.description || targetTicket.deskripsi || '').toLowerCase();
  const targetWords = new Set(targetDesc.split(/\W+/).filter((w) => w.length > 3));

  const duplicates = [];

  for (const item of historicalTickets) {
    const itemNumber = item.number || item.nomor_tiket || '-';
    if (itemNumber === targetNumber) continue;

    const itemDesc = String(item.description || item.deskripsi || '').toLowerCase();
    const itemWords = new Set(itemDesc.split(/\W+/).filter((w) => w.length > 3));

    let common = 0;
    for (const w of targetWords) {
      if (itemWords.has(w)) common++;
    }

    const totalWords = Math.max(1, Math.min(targetWords.size, itemWords.size));
    const score = Number((common / totalWords).toFixed(2));

    if (score >= 0.5) {
      const matchLevel = score >= 0.85 ? 'HIGH' : score >= 0.70 ? 'MEDIUM' : 'LOW';
      duplicates.push({
        ticket_number: itemNumber,
        similarity_score: Math.min(1.0, score),
        match_level: matchLevel,
        is_recurring_issue: score >= 0.70,
        reason: `Ditemukan kesamaan terminologi deskripsi kata kunci (${common} kata cocok).`,
      });
    }
  }

  const hasDuplicates = duplicates.some((d) => d.similarity_score >= 0.70);

  return {
    target_ticket_number: targetNumber,
    has_duplicates: hasDuplicates,
    duplicates: duplicates.sort((a, b) => b.similarity_score - a.similarity_score),
    recommendation: hasDuplicates
      ? 'Ditemukan indikasi duplikasi atau issue berulang. Tinjau tiket historis terkait sebelum melanjutkan pengerjaan.'
      : 'Tidak terdeteksi duplikasi signifikan. Lanjutkan sebagai tiket independen.',
  };
}

/**
 * Detect duplicate and recurring tickets.
 *
 * @param {Object} targetTicket
 * @param {Array<Object>} historicalTickets
 * @param {import('./provider.js').LlmProvider} [provider]
 * @returns {Promise<Object>}
 */
export async function detectDuplicates(targetTicket, historicalTickets = [], provider = null) {
  if (!historicalTickets || historicalTickets.length === 0) {
    return {
      target_ticket_number: targetTicket.number || targetTicket.nomor_tiket || '-',
      has_duplicates: false,
      duplicates: [],
      recommendation: 'Tidak ada daftar tiket historis untuk dibandingkan.',
    };
  }

  const activeProvider = provider || createProvider();
  const userPrompt = formatDuplicatePrompt(targetTicket, historicalTickets);

  try {
    const raw = await activeProvider.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);

    const json = extractJson(raw);
    if (!json) throw new Error('No JSON output from LLM');

    const parsed = JSON.parse(json);

    // Normalize output structure
    const duplicates = Array.isArray(parsed.duplicates)
      ? parsed.duplicates.map((d) => {
          const score = typeof d.similarity_score === 'number' ? Math.max(0, Math.min(1, d.similarity_score)) : 0;
          let level = d.match_level;
          if (!['HIGH', 'MEDIUM', 'LOW'].includes(level)) {
            level = score >= 0.85 ? 'HIGH' : score >= 0.70 ? 'MEDIUM' : 'LOW';
          }
          return {
            ticket_number: String(d.ticket_number || '-'),
            similarity_score: Number(score.toFixed(2)),
            match_level: level,
            is_recurring_issue: Boolean(d.is_recurring_issue ?? score >= 0.70),
            reason: String(d.reason || 'Konteks teknis serupa.'),
          };
        })
      : [];

    return {
      target_ticket_number: String(parsed.target_ticket_number || targetTicket.number || targetTicket.nomor_tiket || '-'),
      has_duplicates: Boolean(parsed.has_duplicates ?? duplicates.some((d) => d.similarity_score >= 0.70)),
      duplicates: duplicates.sort((a, b) => b.similarity_score - a.similarity_score),
      recommendation: String(parsed.recommendation || (duplicates.length > 0 ? 'Tinjau tiket historis yang serupa.' : 'Lanjutkan pengerjaan.')),
    };
  } catch {
    return fallbackDuplicateCheck(targetTicket, historicalTickets);
  }
}
