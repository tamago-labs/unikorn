import OpenAI from 'openai'
import { loadAiConfig, TOOL_DEFS, SAVE_PRD_TOOL } from './helpers.mjs'

const config = loadAiConfig()
const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseUrl.replace(/\/$/, ''),
})

console.log('=== Test with tools (read_file) ===')
const tools = [...TOOL_DEFS, SAVE_PRD_TOOL]
console.log('Tools:', tools.map(t=>t.function.name).join(', '))

try {
  const stream = await client.chat.completions.create({
    model: config.model || 'LongCat-2.0',
    messages: [
      { role: 'system', content: 'You have tools: read_file(path). Call it to read package.json, then call save_prd with markdown "# Test PRD\\n## 1. Overview\\nTest".' },
      { role: 'user', content: 'Please read package.json and then save a PRD.' }
    ],
    tools,
    stream: true,
  })
  let content = ''
  let reasoning = ''
  let toolCalls = []
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta
    if (!delta) continue
    if (delta.reasoning_content) {
      reasoning += delta.reasoning_content
      // console.log('[reasoning]', JSON.stringify(delta.reasoning_content).slice(0,100))
    }
    if (delta.content) {
      content += delta.content
      process.stdout.write(delta.content)
    }
    if (delta.tool_calls) {
      console.log('\n[tool_call delta]', JSON.stringify(delta.tool_calls).slice(0,300))
      toolCalls.push(...delta.tool_calls)
    }
  }
  console.log('\n\n--- Done ---')
  console.log('Reasoning len:', reasoning.length, 'preview:', reasoning.slice(0,200))
  console.log('Content len:', content.length, 'preview:', content.slice(0,300))
  console.log('Tool calls:', toolCalls.length)
  if (toolCalls.length) console.log(JSON.stringify(toolCalls, null, 2).slice(0,800))
} catch (e) {
  console.error('Failed:', e.message, e.response?.data || '')
  console.error(e)
}
