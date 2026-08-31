import OpenAI from 'openai'
import { loadAiConfig } from './helpers.mjs'

const config = loadAiConfig()
const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseUrl.replace(/\/$/, ''),
})

console.log('Testing non-streaming first...')
try {
  const res = await client.chat.completions.create({
    model: config.model || 'LongCat-2.0',
    messages: [{ role: 'user', content: 'Say "ok" if you can hear me.' }],
    max_tokens: 10,
  })
  console.log('Non-streaming response:', JSON.stringify(res, null, 2).slice(0, 1000))
} catch (e) {
  console.error('Non-streaming failed:', e.message, e.response?.data || e)
}

console.log('\nTesting streaming raw chunks...')
try {
  const stream = await client.chat.completions.create({
    model: config.model || 'LongCat-2.0',
    messages: [{ role: 'user', content: 'Say hello world' }],
    stream: true,
    max_tokens: 20,
  })
  let i = 0
  for await (const chunk of stream) {
    console.log(`Chunk ${i++}:`, JSON.stringify(chunk).slice(0, 500))
    if (i > 5) break
  }
} catch (e) {
  console.error('Streaming failed:', e.message)
}
