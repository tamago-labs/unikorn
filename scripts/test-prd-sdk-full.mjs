import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import { loadAiConfig, TOOL_DEFS, SAVE_PRD_TOOL, safeReadFile, safeListFiles } from './helpers.mjs'

const config = loadAiConfig()
const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl.replace(/\/$/, '') })

const folder = 'C:\\projects\\test-kane\\calculator-app'
const inventory = {
  folder,
  fileCount: 23,
  framework: 'vite',
  topLevelFiles: fs.readdirSync(folder).slice(0,10),
  routes: [],
  hasReadme: true,
}

const invSummary = `Folder: ${folder}\nFiles: 23 vite\nTop: ${inventory.topLevelFiles.join(', ')}`

const SYSTEM_GENERATE = `You are Unikorn — generate a Kane-CLI-compatible PRD in markdown. Use tools via function tool_calls, never emit XML tags.

Sections:
# <Product> PRD
> one-line overview
## 1. Overview
Brief overview [src: path]
## 2. Users
- **Role** — desc [src: path]
## 3. Use Cases & AC
### UC-1: title
- **AC-1.1:** Given ... when ... then ... [src: path]
## 4. Non-goals
## 5. Tech Constraints

Rules: Given/When/Then, every claim [src:], stable UC-N, no HTML.
When ready, call save_prd(markdown).`

const messages = [
  { role: 'system', content: SYSTEM_GENERATE },
  { role: 'user', content: `Inventory:\n${invSummary}\nGenerate PRD for this vite calculator app. Read package.json then save_prd.` }
]

const tools = [...TOOL_DEFS, SAVE_PRD_TOOL]

console.log('Starting PRD generation with SDK...')
let fullContent = ''
let reasoning = ''
let captured = null

// helper to handle streaming with SDK
async function callWithTools(msgs, tools) {
  const stream = await client.chat.completions.create({
    model: config.model || 'LongCat-2.0',
    messages: msgs,
    tools,
    stream: true,
    temperature: 0.4,
  })
  let content = ''
  let reasoning = ''
  const toolCallsRaw = {}
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta
    if (!delta) continue
    if (delta.reasoning_content) {
      reasoning += delta.reasoning_content
      process.stdout.write(`[R:${delta.reasoning_content.slice(0,30)}]`)
    }
    if (delta.content) {
      content += delta.content
      process.stdout.write(delta.content)
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0
        if (!toolCallsRaw[idx]) toolCallsRaw[idx] = { id: tc.id || `call_${idx}`, function: { name: '', arguments: '' } }
        if (tc.id) toolCallsRaw[idx].id = tc.id
        if (tc.function?.name) toolCallsRaw[idx].function.name += tc.function.name
        if (tc.function?.arguments) toolCallsRaw[idx].function.arguments += tc.function.arguments
      }
    }
  }
  const toolCalls = Object.values(toolCallsRaw).filter(t=>t.function.name)
  return { content, reasoning, toolCalls }
}

let loops = 0
let finalMarkdown = null
let msgs = [...messages]
while (loops < 3 && !finalMarkdown) {
  console.log(`\n\n--- Loop ${loops+1} ---`)
  const { content, reasoning, toolCalls } = await callWithTools(msgs, tools)
  console.log(`\n[loop ${loops+1} done] content len ${content.length}, reasoning len ${reasoning.length}, toolCalls ${toolCalls.length}`)
  if (toolCalls.length) {
    console.log('Tool calls:', toolCalls.map(t=>`${t.function.name}:${t.function.arguments.slice(0,80)}`).join(' | '))
    const saveCall = toolCalls.find(t=>t.function.name==='save_prd')
    if (saveCall) {
      try {
        const args = JSON.parse(saveCall.function.arguments)
        if (args.markdown && args.markdown.length > 50) {
          finalMarkdown = args.markdown
          console.log('\n✓ Captured via save_prd, len', finalMarkdown.length)
          console.log(finalMarkdown.slice(0,400))
          break
        }
      } catch(e){ console.log('save_prd parse fail', e.message) }
    }
    const hasRead = toolCalls.some(t=>['read_file','list_files'].includes(t.function.name))
    if (hasRead) {
      msgs.push({ role: 'assistant', content: content || null, tool_calls: toolCalls })
      for (const tc of toolCalls) {
        if (tc.function.name==='save_prd') continue
        let args={}
        try{ args=JSON.parse(tc.function.arguments||'{}')}catch{}
        let result=''
        try {
          if (tc.function.name==='read_file') result=safeReadFile(folder, args.path)
          else if (tc.function.name==='list_files') result=safeListFiles(folder, args.dir||'').join('\n')
        } catch(e){ result='Error:'+e.message }
        console.log(`  -> ${tc.function.name} result len ${result.length}`)
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: result.slice(0,2000) })
      }
      loops++
      continue
    }
  }
  if (content && content.length > 100 && /^#\s/m.test(content)) {
    finalMarkdown = content
    console.log('\n✓ Captured via content')
    break
  }
  if (content) fullContent += content
  loops++
}

// Final forced save_prd if still no markdown after 3 loops
if (!finalMarkdown) {
  console.log('\n--- Forcing save_prd ---')
  msgs.push({ role: 'user', content: 'You have read enough files. Now call save_prd with the complete PRD markdown. Do not call read_file again. Markdown must start with # and include ## 1. Overview, ## 3. Use Cases with UC- and [src:].' })
  const stream = await client.chat.completions.create({
    model: config.model || 'LongCat-2.0',
    messages: msgs,
    tools: [SAVE_PRD_TOOL],
    tool_choice: { type: 'function', function: { name: 'save_prd' } },
    stream: true,
  })
  let toolCallsRaw = {}
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0
        if (!toolCallsRaw[idx]) toolCallsRaw[idx] = { id: tc.id || `call_${idx}`, function: { name: '', arguments: '' } }
        if (tc.id) toolCallsRaw[idx].id = tc.id
        if (tc.function?.name) toolCallsRaw[idx].function.name += tc.function.name
        if (tc.function?.arguments) toolCallsRaw[idx].function.arguments += tc.function.arguments
      }
    }
    if (delta?.content) process.stdout.write(delta.content)
  }
  const tcs = Object.values(toolCallsRaw)
  const save = tcs.find(t=>t.function.name==='save_prd')
  if (save) {
    try {
      const a = JSON.parse(save.function.arguments)
      if (a.markdown) {
        finalMarkdown = a.markdown
        console.log('\n✓ Forced save_prd captured, len', finalMarkdown.length)
      }
    } catch(e){ console.log('forced parse fail', e.message, save.function.arguments.slice(0,200)) }
  }
}

if (finalMarkdown) {
  console.log('\n\n=== FINAL PRD (first 600 chars) ===')
  console.log(finalMarkdown.slice(0,600))
  console.log('\n✓ SUCCESS')
} else {
  console.log('\n✗ FAILED - no markdown captured, fullContent len', fullContent.length)
  console.log(fullContent.slice(0,500))
}
