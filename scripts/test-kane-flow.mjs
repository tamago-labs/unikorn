import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const folder = 'C:\\projects\\test-kane\\calculator-app'
const prdSrc = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.unikorn', 'projects', crypto.createHash('sha256').update(path.resolve(folder)).digest('hex').slice(0,16), 'PRD.md')

function run(cmd, opts = {}) {
  const isDesign = cmd.includes('design tests')
  const timeout = isDesign ? 300000 : 180000
  console.log(`\n$ ${cmd} (timeout ${timeout/1000}s)`)
  try {
    const out = execSync(cmd, { encoding: 'utf-8', cwd: folder, timeout, env: { ...process.env, KANE_CLI_USER_AGENT: 'unikorn' }, ...opts })
    console.log(out.slice(0, 4000))
    return { ok: true, out }
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '') + (e.message || '')
    console.log(`Exit ${e.status}\n${out.slice(0, 4000)}`)
    return { ok: false, out, code: e.status }
  }
}

console.log('=== Kane flow test for', folder, '===')
console.log('PRD src:', prdSrc, fs.existsSync(prdSrc) ? `${fs.statSync(prdSrc).size} bytes` : 'MISSING')

// 1. whoami / version
run('kane-cli --version')
run('kane-cli whoami')

// 2. ensure PRD is in project for ingest (copy)
const dest = path.join(folder, 'PRD.generated.md')
if (fs.existsSync(prdSrc)) {
  fs.copyFileSync(prdSrc, dest)
  console.log(`Copied PRD to ${dest}`)
}

// 3. list before
console.log('\n--- context list before ingest ---')
run('kane-cli context list --json --inferred')

// 4. ingest
console.log('\n--- ingest PRD ---')
let r = run(`kane-cli context ingest "${dest}" --mode agent`)
if (!r.ok && r.out.includes('already')) console.log('Ingest maybe already done, continuing')

// 5. list after ingest
console.log('\n--- list after ingest ---')
r = run('kane-cli context list --json --inferred')
let ucs = []
try {
  ucs = r.out.split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(o=>o.label==='usecase')
  console.log(`Found ${ucs.length} UCs:`, ucs.map(u=>u.id).join(', '))
} catch(e){ console.log('parse list fail', e.message) }

// 6. approve all derived (review)
console.log('\n--- review approve derived ---')
if (ucs.length) {
  const derived = ucs.filter(u=>u.trust==='derived').map(u=>u.id).join(' ')
  if (derived) run(`kane-cli context review --approve ${derived} --json`)
  else console.log('No derived UCs to approve (already trusted?)')
  run('kane-cli context list --json --inferred')
}

// 7. design one UC (uc-1)
console.log('\n--- design tests for uc-1 ---')
r = run('kane-cli design tests --use-case uc-1 --mode agent --max 4')
console.log('Design exit', r.ok ? 'ok' : 'needs review or failed')

// 8. review design (approve)
console.log('\n--- review design ---')
run('kane-cli context list --json --inferred')

// 9. cover gaps
console.log('\n--- cover gaps ---')
run('kane-cli cover gaps --json')

// 10. check .testmuai
console.log('\n--- .testmuai/tests ---')
try {
  const testDir = path.join(folder, '.testmuai', 'tests')
  if (fs.existsSync(testDir)) {
    const walk = (d, depth=0) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory() && depth < 2) walk(p, depth+1)
        else if (e.name.endsWith('_test.md')) console.log(' ', path.relative(folder, p))
      }
    }
    walk(testDir)
  } else console.log('No .testmuai/tests yet (need testmd run)')
} catch(e){ console.log(e.message) }

console.log('\n=== Done — check if flow can complete before frontend ===')
console.log('If design succeeded, next would be: kane-cli testmd run <file> --agent')
console.log('Then: kane-cli testrun run --match t-  and  kane-cli cover gaps')
