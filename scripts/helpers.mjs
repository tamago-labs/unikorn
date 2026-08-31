import fs from 'fs'
import path from 'path'
import os from 'os'

export function loadAiConfig() {
  const userDataPath = path.join(os.homedir(), '.unikorn')
  const aiConfigPath = path.join(userDataPath, 'aiConfig.json')
  try {
    if (fs.existsSync(aiConfigPath)) {
      return JSON.parse(fs.readFileSync(aiConfigPath, 'utf-8'))
    }
  } catch {}
  return { baseUrl: '', apiKey: '', model: '' }
}

export function stripGenericToolTags(text) {
  // reuse same logic as main code, but simplified for script
  return text
    .replace(/<(?:tool_call|longcat_tool_call|function_call|invoke)\b[^>]*>[\s\S]*?<\/(?:tool_call|longcat_tool_call|function_call|invoke)>/gi, '')
    .replace(/<\/?(?:tool_call|longcat_tool_call|function_call|invoke|file_path|path|file|markdown)\b[^>]*\/?>/gi, '')
    .replace(/<\/?longcat[^>]*>/gi, '')
    .replace(/<\/?longcat_arg[^>]*>/gi, '')
    .trim()
}

export function extractMarkdown(text) {
  const withoutTools = stripGenericToolTags(text)
  const m = withoutTools.match(/(^#\s[\s\S]*)/m)
  return (m ? m[1] : withoutTools).replace(/```markdown|```/g, '').trim()
}

export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file relative to project folder, truncated to 8000 chars.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory.',
      parameters: { type: 'object', properties: { dir: { type: 'string' } }, required: [] },
    },
  },
]

export const SAVE_PRD_TOOL = {
  type: 'function',
  function: {
    name: 'save_prd',
    description: 'Save final PRD markdown. Kane-compatible.',
    parameters: { type: 'object', properties: { markdown: { type: 'string' } }, required: ['markdown'] },
  },
}

export function safeReadFile(folder, rel) {
  const abs = path.resolve(path.join(folder, rel))
  const root = path.resolve(folder)
  if (!abs.startsWith(root)) throw new Error('Path outside folder')
  return fs.readFileSync(abs, 'utf-8').slice(0, 8000)
}

export function safeListFiles(folder, relDir = '', limit = 50) {
  const abs = path.resolve(path.join(folder, relDir || '.'))
  const entries = fs.readdirSync(abs, { withFileTypes: true })
  return entries.filter(e => e.name !== 'node_modules' && !e.name.startsWith('.')).slice(0, limit).map(e => e.name + (e.isDirectory() ? '/' : ''))
}
