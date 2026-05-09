/**
 * Parses and validates a Teams/Streams/People import file (JSON or Excel).
 * Returns either a validated payload ready to pass to the store, or a list of errors.
 */

import type { Role } from '../../core/types';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface ImportTeamRow {
  name: string;
  description: string;
}

export interface ImportStreamRow {
  name: string;
  description: string;
  color: string;
}

export interface ImportPersonRow {
  name: string;
  teamName: string;
  role: Role;
  effectiveCapacity: number;
}

export interface ImportPayload {
  teams: ImportTeamRow[];
  streams: ImportStreamRow[];
  people: ImportPersonRow[];
}

export interface ImportResult {
  ok: true;
  payload: ImportPayload;
  warnings: string[];
}

export interface ImportError {
  ok: false;
  errors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COLOR = '#4F46E5';
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const VALID_ROLES: Record<string, Role> = {
  developer: 'Developer',
  sdet: 'SDET',
  operations: 'Operations',
};

// ─── Role normalization ───────────────────────────────────────────────────────

function normalizeRole(raw: string): Role | null {
  return VALID_ROLES[raw.trim().toLowerCase()] ?? null;
}

// ─── JSON import ──────────────────────────────────────────────────────────────

export function parseJsonImport(json: string): ImportResult | ImportError {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['File is not valid JSON.'] };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['JSON root must be an object.'] };
  }

  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];

  const teams = parseJsonTeams(obj['teams'], errors);
  const streams = parseJsonStreams(obj['streams'], errors, warnings);
  const people = parseJsonPeople(obj['people'], errors, warnings);

  if (errors.length) return { ok: false, errors };
  return { ok: true, payload: { teams, streams, people }, warnings };
}

function parseJsonTeams(raw: unknown, errors: string[]): ImportTeamRow[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) { errors.push('"teams" must be an array.'); return []; }
  return raw.flatMap((item, i) => {
    if (typeof item !== 'object' || item === null) { errors.push(`teams[${i}]: must be an object.`); return []; }
    const row = item as Record<string, unknown>;
    if (!row['name'] || typeof row['name'] !== 'string' || !row['name'].trim()) {
      errors.push(`teams[${i}]: "name" is required.`); return [];
    }
    return [{ name: (row['name'] as string).trim(), description: typeof row['description'] === 'string' ? row['description'].trim() : '' }];
  });
}

function parseJsonStreams(raw: unknown, errors: string[], warnings: string[]): ImportStreamRow[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) { errors.push('"streams" must be an array.'); return []; }
  return raw.flatMap((item, i) => {
    if (typeof item !== 'object' || item === null) { errors.push(`streams[${i}]: must be an object.`); return []; }
    const row = item as Record<string, unknown>;
    if (!row['name'] || typeof row['name'] !== 'string' || !row['name'].trim()) {
      errors.push(`streams[${i}]: "name" is required.`); return [];
    }
    let color = DEFAULT_COLOR;
    if (row['color'] && typeof row['color'] === 'string') {
      if (HEX_RE.test(row['color'])) color = row['color'];
      else warnings.push(`streams[${i}] "${row['name']}": invalid color "${row['color']}", using default ${DEFAULT_COLOR}.`);
    }
    return [{
      name: (row['name'] as string).trim(),
      description: typeof row['description'] === 'string' ? row['description'].trim() : '',
      color,
    }];
  });
}

function parseJsonPeople(raw: unknown, errors: string[], warnings: string[]): ImportPersonRow[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) { errors.push('"people" must be an array.'); return []; }
  return raw.flatMap((item, i) => {
    if (typeof item !== 'object' || item === null) { errors.push(`people[${i}]: must be an object.`); return []; }
    const row = item as Record<string, unknown>;
    const rowErrors: string[] = [];

    if (!row['name'] || typeof row['name'] !== 'string' || !row['name'].trim())
      rowErrors.push(`people[${i}]: "name" is required.`);
    if (!row['team'] || typeof row['team'] !== 'string' || !row['team'].trim())
      rowErrors.push(`people[${i}]: "team" is required.`);

    const roleRaw = typeof row['role'] === 'string' ? row['role'] : '';
    const role = normalizeRole(roleRaw);
    if (!role) rowErrors.push(`people[${i}] "${row['name'] ?? '?'}": role "${roleRaw}" is invalid — must be Developer, SDET, or Operations.`);

    if (rowErrors.length) { errors.push(...rowErrors); return []; }

    let effectiveCapacity = 1.0;
    const capRaw = row['effectiveCapacity'];
    if (capRaw !== undefined && capRaw !== null) {
      const pct = Number(capRaw);
      if (isNaN(pct) || pct < 10 || pct > 100) {
        warnings.push(`people[${i}] "${row['name']}": effectiveCapacity "${capRaw}" out of range (10–100), using 100.`);
      } else {
        effectiveCapacity = pct / 100;
      }
    }

    return [{
      name: (row['name'] as string).trim(),
      teamName: (row['team'] as string).trim(),
      role: role!,
      effectiveCapacity,
    }];
  });
}

// ─── Excel import ─────────────────────────────────────────────────────────────

export async function parseExcelImport(file: File): Promise<ImportResult | ImportError> {
  // Dynamically import xlsx to keep it out of the initial bundle
  const XLSX = await import('xlsx');

  let workbook: import('xlsx').WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    return { ok: false, errors: ['Could not read Excel file. Ensure it is a valid .xlsx file.'] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Teams sheet ──
  const teams = parseExcelTeams(workbook, XLSX, errors);

  // ── Streams sheet ──
  const streams = parseExcelStreams(workbook, XLSX, errors, warnings);

  // ── People sheet ──
  const people = parseExcelPeople(workbook, XLSX, errors, warnings);


  if (errors.length) return { ok: false, errors };
  return { ok: true, payload: { teams, streams, people }, warnings };
}

function sheetToRows(workbook: import('xlsx').WorkBook, xlsx: typeof import('xlsx'), sheetName: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const raw = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  // Normalize all keys to lowercase+trimmed so Excel column header casing never matters
  return raw.map(row =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v])),
  );
}

/** Look up a value from a normalized (lowercase-keyed) row, trying multiple candidate key names. */
function col(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseExcelTeams(wb: import('xlsx').WorkBook, xlsx: typeof import('xlsx'), errors: string[]): ImportTeamRow[] {
  const rows = sheetToRows(wb, xlsx, 'Teams');
  return rows.flatMap((row, i) => {
    const name = col(row, 'Name', 'Team Name', 'TeamName');
    if (!name) { errors.push(`Teams sheet row ${i + 2}: "Name" is required.`); return []; }
    return [{ name, description: col(row, 'Description', 'Desc') }];
  });
}

function parseExcelStreams(wb: import('xlsx').WorkBook, xlsx: typeof import('xlsx'), errors: string[], warnings: string[]): ImportStreamRow[] {
  const rows = sheetToRows(wb, xlsx, 'Streams');
  return rows.flatMap((row, i) => {
    const name = col(row, 'Name', 'Stream Name', 'StreamName');
    if (!name) { errors.push(`Streams sheet row ${i + 2}: "Name" is required.`); return []; }
    const description = col(row, 'Description', 'Desc');
    const colorRaw = col(row, 'Color', 'Colour', 'Hex', 'HexColor');
    let color = DEFAULT_COLOR;
    if (colorRaw) {
      if (HEX_RE.test(colorRaw)) color = colorRaw;
      else warnings.push(`Streams sheet row ${i + 2} "${name}": invalid color "${colorRaw}", using default ${DEFAULT_COLOR}.`);
    }
    return [{ name, description, color }];
  });
}

function parseExcelPeople(wb: import('xlsx').WorkBook, xlsx: typeof import('xlsx'), errors: string[], warnings: string[]): ImportPersonRow[] {
  const rows = sheetToRows(wb, xlsx, 'People');
  return rows.flatMap((row, i) => {
    const rowErrors: string[] = [];
    const name     = col(row, 'Name', 'Full Name', 'FullName', 'Person Name', 'PersonName');
    const teamName = col(row, 'Team', 'Team Name', 'TeamName', 'Group');
    const roleRaw  = col(row, 'Role', 'Job Role', 'JobRole', 'Job Title', 'JobTitle');

    if (!name) rowErrors.push(`People sheet row ${i + 2}: "Name" is required.`);
    if (!teamName) rowErrors.push(`People sheet row ${i + 2}: "Team" is required.`);
    const role = normalizeRole(roleRaw);
    if (!role) rowErrors.push(`People sheet row ${i + 2} "${name || '?'}": Role "${roleRaw}" is invalid — must be Developer, SDET, or Operations.`);

    if (rowErrors.length) { errors.push(...rowErrors); return []; }

    const capRaw = col(row, 'Effective Capacity %', 'Effective Capacity', 'Capacity %', 'Capacity', 'effectivecapacity');
    let effectiveCapacity = 1.0;
    if (capRaw !== '') {
      const pct = Number(capRaw);
      if (isNaN(pct) || pct < 10 || pct > 100) {
        warnings.push(`People sheet row ${i + 2} "${name}": Effective Capacity % "${capRaw}" out of range (10–100), using 100.`);
      } else {
        effectiveCapacity = pct / 100;
      }
    }

    return [{ name, teamName, role: role!, effectiveCapacity }];
  });
}
