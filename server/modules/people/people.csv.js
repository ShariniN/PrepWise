// Small CSV parser: UTF-8 BOM, CRLF/LF, quoted fields with commas, newlines and doubled quotes.
export const parseCsv = (text) => {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
};

export const MAX_IMPORT_ROWS = 2000;

// Returns { rows: [{ line, email, name, role, group }] } or { error }. `line` is the 1-based CSV line number
// of the record, counting the header, so it matches what a spreadsheet shows. `group` is optional ('' when absent);
// its length is checked when the row is invited, so one bad row does not reject the whole file.
export const parseUsersCsv = (text) => {
  const table = parseCsv(text);
  if (!table.length) return { error: 'The CSV is empty' };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const emailIdx = header.indexOf('email');
  if (emailIdx === -1) return { error: 'The CSV needs an "email" column' };
  const nameIdx = header.indexOf('name');
  const roleIdx = header.indexOf('role');
  const groupIdx = header.indexOf('group');
  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    return { error: `Too many rows: ${body.length}. The maximum is ${MAX_IMPORT_ROWS} per import`, tooMany: true };
  }
  return {
    rows: body.map((r, i) => ({
      line: i + 2,
      email: (r[emailIdx] || '').trim().toLowerCase(),
      name: nameIdx === -1 ? '' : (r[nameIdx] || '').trim(),
      role: roleIdx === -1 ? 'student' : ((r[roleIdx] || '').trim().toLowerCase() || 'student'),
      group: groupIdx === -1 ? '' : (r[groupIdx] || '').trim(),
    })),
  };
};
