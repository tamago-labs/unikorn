import OpenAI from 'openai'
import { loadAiConfig } from './helpers.mjs'

const config = loadAiConfig()
console.log('Config:', { baseUrl: config.baseUrl, model: config.model, hasKey: !!config.apiKey })

if (!config.baseUrl || !config.apiKey) {
  console.error('AI not configured')
  process.exit(1)
}

const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseUrl.replace(/\/$/, ''),
})

console.log('\n=== Test 1: Basic streaming (no tools) ===')
try {
  const stream = await client.chat.completions.create({
    model: config.model || 'LongCat-2.0',
    messages: [{ role: 'user', content: 'Say "ok" if you can hear me. Reply with one word.' }],
    stream: true,
    max_tokens: 10,
  })
  let content = ''
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || ''
    if (delta) {
      content += delta
      process.stdout.write(delta)
    }
  }
  console.log('\n✓ Basic streaming done, content len:', content.length)
} catch (e) {
  console.error('Basic streaming failed:', e.message)
}

console.log('\n=== Test 2: Streaming with thinking (if supported) ===')
try {
  const stream2 = await client.chat.completions.create({
    model: config.model || 'LongCat-2.0',
    messages: [{ role: 'user', content: 'Hello, what is 2+2?' }],
    stream: true,
    max_tokens: 50,
  })
  let content2 = ''
  for await (const chunk of stream2) {
    const delta = chunk.choices[0]?.delta?.content || ''
    if (delta) content2 += delta
  }
  console.log('Content:', JSON.stringify(content2.slice(0, 200)))
  console.log('✓ Second test done')
} catch (e) {
  console.error('Second test failed:', e.message)
}
