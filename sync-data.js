const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const projectDir = __dirname;
const sourcePath = path.resolve(projectDir, '..', '..', 'Diakonia.xlsx');
const outputPath = path.join(projectDir, 'dist', 'data.json');
const bytes = fs.readFileSync(sourcePath);

function zipFiles(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('Nu am găsit directorul arhivei XLSX.');
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Director XLSX invalid.');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed) : null;
    if (!data) throw new Error(`Metodă de compresie XLSX nesuportată (${method}): ${name}`);
    files.set(name, data.toString('utf8'));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decodeXml = (value) => value.replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attrs = (text) => Object.fromEntries([...text.matchAll(/([\w:.-]+)="([^"]*)"/g)].map(m => [m[1], decodeXml(m[2])]));
const allText = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decodeXml(m[1])).join('');
const getTag = (xml, name) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`))?.[1] ?? '';
const files = zipFiles(bytes);

const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => allText(m[1]));
const fillsXml = getTag(files.get('xl/styles.xml') ?? '', 'fills');
const fills = [...fillsXml.matchAll(/<fill\b[^>]*>([\s\S]*?)<\/fill>/g)].map(m => {
  const color = m[1].match(/<fgColor\b([^>]*)\/?\s*>/);
  if (!color) return '';
  const a = attrs(color[1]);
  return a.rgb || (a.theme !== undefined ? `theme:${a.theme}` : '');
});
const xfsXml = getTag(files.get('xl/styles.xml') ?? '', 'cellXfs');
const styleFills = [...xfsXml.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map(m => Number(attrs(m[1]).fillId || 0));

const relsXml = files.get('xl/_rels/workbook.xml.rels') ?? '';
const relationships = new Map([...relsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map(m => {
  const a = attrs(m[1]); return [a.Id, a.Target];
}));
const workbookXml = files.get('xl/workbook.xml') ?? '';
const sheetEntries = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map(m => attrs(m[1]));
const getCol = (reference) => reference.match(/^[A-Z]+/)?.[0] ?? '';

const sheets = sheetEntries.map(sheet => {
  const relId = sheet['r:id'];
  let target = relationships.get(relId);
  if (!target) throw new Error(`Nu am găsit foaia ${sheet.name} în XLSX.`);
  target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const xml = files.get(target);
  if (!xml) throw new Error(`Conținutul foii lipsește: ${target}`);
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = attrs(rowMatch[1]);
    const cells = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cellAttrs = attrs(cellMatch[1]);
      const column = getCol(cellAttrs.r || '');
      if (!column) continue;
      const body = cellMatch[2] || '';
      const type = cellAttrs.t || '';
      let value = '';
      if (type === 'inlineStr') value = allText(body);
      else {
        const raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? '';
        value = type === 's' ? (shared[Number(raw)] ?? '') : type === 'b' ? (raw === '1' ? 'TRUE' : 'FALSE') : decodeXml(raw);
      }
      if (!value) continue;
      // Keep the individual compensation note out of the website export.
      if (sheet.name === 'Departamentele bisericii' && /majorare\s+salar/i.test(value)) continue;
      const styleIndex = Number(cellAttrs.s || 0);
      const fillIndex = styleFills[styleIndex] || 0;
      cells.push({ column, value: String(value), fill: fills[fillIndex] || '' });
    }
    if (cells.length) rows.push({ row: Number(rowAttrs.r), cells });
  }
  return { name: sheet.name, rows };
});

const formatLocal = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
const payload = {
  source: 'Diakonia.xlsx',
  extractedAt: formatLocal(new Date()),
  sourceModifiedAt: formatLocal(fs.statSync(sourcePath).mtime),
  sheets,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload), 'utf8');
console.log(`Sincronizat din ${payload.source} (${payload.sourceModifiedAt}); ${sheets.length} foi, ${sheets.reduce((n, s) => n + s.rows.length, 0)} rânduri.`);
