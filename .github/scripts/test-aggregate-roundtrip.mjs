#!/usr/bin/env node
// End-to-end regression test for the aggregate JSON/CSV sidecars
// produced by render-spec-summary.sh.
//
// Why a dedicated test (separate from test-spec-summary-parser.sh):
//   - Validates the JSON with `JSON.parse` (catches trailing-comma drift,
//     unescaped control chars, structural breakage).
//   - Validates each CSV row with a real RFC 4180 parser so quoting bugs
//     ("foo,bar" instead of "\"foo,bar\"", missing doubled inner quotes,
//     bare CR/LF in fields, etc.) fail loudly instead of producing a CSV
//     that opens "fine" in a spreadsheet but corrupts trend dashboards.
//   - Covers labels that are realistic worst-case CI strings: commas,
//     embedded double quotes, backslashes, unicode, leading whitespace,
//     a TAB, and a CRLF — i.e. the kinds of values that would appear
//     in a hand-edited RUN_LABEL or a shard naming convention change.
//
// Exits 0 on success, 1 on any assertion failure.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const renderer = join(here, 'render-spec-summary.sh');
const work = mkdtempSync(join(tmpdir(), 'agg-rt-'));

let pass = 0;
let fail = 0;
function check(cond, label, detail) {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else      { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

// Minimal RFC 4180 parser. Returns rows (arrays of fields). Throws on
// malformed input. Handles: doubled quotes inside quoted fields, commas
// + CR/LF inside quoted fields, bare fields without quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        if (field.length !== 0) throw new Error(`Quote mid-field at ${i}`);
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else if (c === '\r') {
        if (text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
  }
  if (inQuotes) throw new Error('Unterminated quoted field');
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Edge-case labels — every entry is one (RUN_LABEL, RUN_PHASE) pair
// the renderer should round-trip through JSON + CSV without corruption.
const edgeCases = [
  { label: 'simple-shard-2',                 phase: 'run1' },
  { label: 'full, "shard"=2/4',              phase: 're"run' },
  { label: 'has\\backslash and "quote"',     phase: 'phase\\1' },
  { label: 'unicode ✓ café — emoji 🎭',      phase: 'rún' },
  { label: '  leading and trailing spaces  ',phase: 'p' },
  { label: 'tab\there and newline\nhere',    phase: 'multi\nline' },
  { label: 'crlf\r\nin middle',              phase: 'crlf' },
];

const tsv = join(work, 'edge.tsv');
writeFileSync(tsv,
  'specA\t1\t1\t0\t1\t1\t4096\t16384\tok\tok\n' +
  'specB\t0\t0\t0\t1\t1\t0\t0\tabsent\tabsent\n');

const csvPath = join(work, 'edge.csv');

for (const { label, phase } of edgeCases) {
  const jsonPath = join(work, `edge-${pass + fail}.json`);
  try {
    execFileSync('bash', [renderer, tsv, '', 'EdgeCase'], {
      env: {
        ...process.env,
        RUN_LABEL: label,
        RUN_PHASE: phase,
        RUN_ATTEMPT: '7',
        AGGREGATE_OUT_JSON: jsonPath,
        AGGREGATE_OUT_CSV: csvPath,
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } catch (err) {
    check(false, `renderer ran for label=${JSON.stringify(label)}`, err.message);
    continue;
  }

  // JSON validity + round-trip.
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    check(false, `JSON parses for label=${JSON.stringify(label)}`, err.message);
    continue;
  }
  check(parsed.label === label, `JSON.label round-trip (${JSON.stringify(label)})`,
        `got ${JSON.stringify(parsed.label)}`);
  check(parsed.phase === phase, `JSON.phase round-trip (${JSON.stringify(phase)})`,
        `got ${JSON.stringify(parsed.phase)}`);
  check(parsed.attempt === 7, 'JSON.attempt propagated');
  check(parsed.schema_version === 1, 'JSON.schema_version pinned to 1');
}

// Now the CSV (appended across all edge cases). Parse the WHOLE file and
// check every data row's label/phase columns round-trip without loss.
const csvText = readFileSync(csvPath, 'utf8');
let rows;
try {
  rows = parseCsv(csvText);
} catch (err) {
  check(false, 'CSV parses as RFC 4180', err.message);
  process.exit(1);
}
check(rows.length === edgeCases.length + 1, `CSV row count = ${edgeCases.length + 1} (header + ${edgeCases.length} data rows)`,
      `got ${rows.length}`);
check(rows[0][0] === 'label' && rows[0][1] === 'phase', 'CSV header columns intact');
for (let i = 0; i < edgeCases.length; i++) {
  const { label, phase } = edgeCases[i];
  const row = rows[i + 1];
  check(row[0] === label, `CSV row ${i + 1} label round-trips`,
        `expected ${JSON.stringify(label)} got ${JSON.stringify(row[0])}`);
  check(row[1] === phase, `CSV row ${i + 1} phase round-trips`,
        `expected ${JSON.stringify(phase)} got ${JSON.stringify(row[1])}`);
  check(row.length === 16, `CSV row ${i + 1} has 16 fields`, `got ${row.length}`);
}

if (fail > 0) {
  console.log(`FAILED: ${fail} assertion(s), ${pass} passed.`);
  process.exit(1);
}
console.log(`OK: all ${pass} assertions passed.`);
