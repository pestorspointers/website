// Validates a seed file against the real block schema: types, field names,
// select values, and per-block list-item fields — all read from blocks.js so
// the check can't drift from the code the way hand-written assumptions do.
import fs from 'node:fs';
const src = fs.readFileSync('client/lib/blocks.js', 'utf8');
const BG = ['white','light','navy','dark','accent'];
const enums = { background:BG, align:['center','left'], overlay:['navy','dark','accent','none'],
  size:['small','medium','large'], imageStyle:['avatar','wide'], imagePosition:['left','right'],
  cardStyle:['white','navy','light'], columns:['2','3','4'], height:['small','medium','large'] };

const shared = ['background','align','ctaLabel','ctaHref'];
const schema = {};
for (const m of src.matchAll(/\n  ([a-zA-Z]+): \{/g)) {
  const t = m[1], i = m.index, j = src.indexOf('\n  },', i);
  const seg = src.slice(i, j);
  const fields = new Set([...seg.matchAll(/name: '([a-zA-Z]+)'/g)].map(x => x[1]).concat(shared));
  const listMatch = seg.match(/name: '(\w+)',\s*type: 'list'[\s\S]*?itemFields: \[([\s\S]*?)\]/);
  schema[t] = {
    fields,
    listName: listMatch?.[1] ?? null,
    itemFields: listMatch ? [...listMatch[2].matchAll(/name: '(\w+)'/g)].map(x => x[1]) : [],
  };
}

const sql = fs.readFileSync(process.argv[2], 'utf8');
let bad = 0, n = 0;
for (const [, type, , body] of sql.matchAll(/\('([a-zA-Z]+)', (\d+), \$json\$([\s\S]*?)\$json\$/g)) {
  n++;
  const s = schema[type];
  if (!s) { console.log(`  ✗ unknown block type: ${type}`); bad++; continue; }
  const obj = JSON.parse(body);
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      if (k !== s.listName) { console.log(`  ✗ ${type}: list should be "${s.listName}", got "${k}"`); bad++; continue; }
      for (const item of v) for (const ik of Object.keys(item))
        if (!s.itemFields.includes(ik)) { console.log(`  ✗ ${type}.${k}[].${ik} — expected ${s.itemFields.join('|')}`); bad++; }
      continue;
    }
    if (!s.fields.has(k)) { console.log(`  ✗ ${type}.${k} is not a field`); bad++; }
    else if (enums[k] && !enums[k].includes(String(v))) { console.log(`  ✗ ${type}.${k}=${JSON.stringify(v)} not in ${enums[k].join('|')}`); bad++; }
  }
}
console.log(bad === 0 ? `  ✓ ${n} blocks valid against blocks.js` : `  ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
