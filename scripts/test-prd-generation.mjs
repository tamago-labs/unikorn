#!/usr/bin/env node
// Standalone test for PRD markdown capture — no server, no WS, no credits
// Tests the generic tool-tag stripping and save_prd capture logic separately

function extractGenericToolCalls(text) {
  const calls = []
  let clean = text
  // 1) try complete tagged blocks
  const tagRe = /<(?:tool_call|longcat_tool_call|function_call|invoke)\b[^>]*>([\s\S]*?)<\/(?:tool_call|longcat_tool_call|function_call|invoke)>/gi
  const matches = []
  let m
  while ((m = tagRe.exec(text)) !== null) matches.push({ raw: m[0], inner: m[1] })
  for (const { raw, inner } of matches) {
    const lowerRaw = raw.toLowerCase()
    const lowerInner = inner.toLowerCase()
    if (lowerRaw.includes('save_prd') || lowerInner.includes('save_prd') || inner.includes('markdown')) {
      let md = ''
      const mdTag = inner.match(/<(?:markdown)\b[^>]*>([\s\S]*?)<\/(?:markdown)>/i)
      if (mdTag) md = mdTag[1].trim()
      else {
        try {
          const obj = JSON.parse(inner.match(/\{[\s\S]*\}/)?.[0] || '{}')
          if (obj.markdown) md = obj.markdown
        } catch {}
        if (!md) {
          const stripped = inner.replace(/<[^>]+>/g, ' ').trim()
          if (/^#\s/m.test(stripped)) md = stripped
        }
      }
      if (md && md.length > 20) calls.push({ tool: 'save_prd', args: { markdown: md } })
      clean = clean.split(raw).join('')
      continue
    }
    let rel = ''
    const pathTag = inner.match(/<(?:file_path|path|file)\b[^>]*>([^<]+)<\/(?:file_path|path|file)>/i)
    if (pathTag) rel = pathTag[1].trim()
    else {
      const jsonPath = inner.match(/"path"\s*:\s*"([^"]+)"/i) || inner.match(/"file_path"\s*:\s*"([^"]+)"/i)
      if (jsonPath) rel = jsonPath[1].trim()
    }
    if (rel) calls.push({ tool: 'read_file', args: { path: rel } })
    clean = clean.split(raw).join('')
  }
  // 2) fragmented fallback - e.g. "tool_call</longcat_arg_key><longcat_arg_value>read_file..." without opening <
  const hasToolKeyword = /tool_call|longcat|_arg_key|_arg_value|read_file|list_dir|file_path|relative_workspace_path/i.test(clean)
  const hasMarkdown = /^#\s|^##\s/m.test(clean)
  if (hasToolKeyword && !hasMarkdown) {
    const fragJson = clean.match(/"file_path"\s*:\s*"([^"]+)"/i) || clean.match(/"path"\s*:\s*"([^"]+)"/i)
    if (fragJson) {
      // avoid duplicate if already added
      if (!calls.some(c=>c.args.path===fragJson[1])) calls.push({ tool: 'read_file', args: { path: fragJson[1] } })
    } else {
      const fragList = clean.match(/"relative_workspace_path"\s*:\s*"([^"]+)"/i)
      if (fragList) calls.push({ tool: 'list_files', args: { dir: fragList[1] } })
    }
    // tool-only fragment → drop entirely, don't leak to PRD
    clean = ''
  }
  clean = clean.replace(/<\/?(?:tool_call|longcat_tool_call|function_call|invoke|file_path|path|file|markdown)\b[^>]*\/?>/gi, '')
  clean = clean.replace(/<\/?longcat[^>]*>/gi, '')
  clean = clean.replace(/<\/?longcat_arg[^>]*>/gi, '')
  return { clean: clean.trim(), calls }
}

function stripGenericToolTags(text) { return extractGenericToolCalls(text).clean }

function extractMarkdown(text) {
  const withoutTools = stripGenericToolTags(text)
  const m = withoutTools.match(/(^#\s[\s\S]*)/m)
  return (m ? m[1] : withoutTools).replace(/```markdown|```/g, '').trim()
}

// --- Test cases from user reports ---
const cases = [
  {
    name: 'fragmented longcat read (user report 1)',
    input: `tool_call</longcat_arg_key><longcat_arg_key>name</longcat_arg_key>
<longcat_arg_value>read_file</longcat_arg_value><longcat_arg_key>arguments</longcat_arg_key>
<longcat_arg_value>{"file_path": "C:/projects/test-kane/calculator-app/package.json"}</longcat_arg_value>`,
  },
  {
    name: 'full longcat block',
    input: `<longcat_tool_call><longcat_arg_key>name</longcat_arg_key><longcat_arg_value>read_file</longcat_arg_value><longcat_arg_key>arguments</longcat_arg_key><longcat_arg_value>{"file_path": "C:/projects/test-kane/calculator-app/README.md"}</longcat_arg_value></longcat_tool_call>`,
  },
  {
    name: 'PRD draft streaming with interleaved tool + markdown',
    input: `<longcat_tool_call>read_file {"file_path": "package.json"}</longcat_tool_call>
# Calculator App PRD
> A simple calculator

## 1. Overview
Calculator does math [src: src/App.tsx]`,
  },
  {
    name: 'only tool calls, no markdown (should be empty after strip)',
    input: `<tool_call>read_file {"path": "package.json"}</tool_call><tool_call>read_file {"path": "README.md"}</tool_call>`,
  },
  {
    name: 'clean markdown (should pass through)',
    input: `# My App PRD
> Overview

## 1. Overview
Hello world [src: src/main.tsx]

## 3. Use Cases
### UC-1: Calc
- **AC-1.1:** Given ... [src: src/App.tsx]`,
  },
]

console.log('=== Generic tag stripping tests ===\n')
for (const c of cases) {
  const { clean, calls } = extractGenericToolCalls(c.input)
  console.log(`Case: ${c.name}`)
  console.log(`  calls: ${calls.map(x=>x.tool+':'+JSON.stringify(x.args)).join(', ') || '(none)'}`)
  console.log(`  clean len ${clean.length} preview: ${JSON.stringify(clean.slice(0,120))}`)
  console.log(`  extracted markdown len ${extractMarkdown(c.input).length}\n`)
}

// --- save_prd tool test ---
console.log('=== save_prd capture test ===\n')
const saveInput = `<tool_call><function name="save_prd"><parameter name="markdown"># Test PRD
## 1. Overview
Test [src: package.json]</parameter></function></tool_call>`
// simulate OpenAI tool_calls path also
const mockToolCall = { function: { name: 'save_prd', arguments: JSON.stringify({ markdown: '# Mock PRD\n## 1. Overview\nMock [src: README.md]' }) } }
console.log('Mock tool_call args:', mockToolCall.function.arguments.slice(0,80))
try {
  const parsed = JSON.parse(mockToolCall.function.arguments)
  console.log('Parsed markdown preview:', parsed.markdown.slice(0,60))
  console.log('Stripped:', stripGenericToolTags(parsed.markdown).slice(0,60))
} catch(e){ console.log('parse err', e.message) }

console.log('\n=== Summary ===')
console.log('If any clean still contains tool_call/_arg_key/file_path → FAIL')
console.log('If clean markdown loses # header → FAIL')
console.log('Run: node scripts/test-prd-generation.mjs')
