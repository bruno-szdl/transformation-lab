import React from 'react'

/**
 * Shared lightweight markdown renderer used by lesson concept text, task
 * prompts, hints, quiz options, and any intro/UI copy that should support
 * **bold**, *italic*, `code`, fenced ```code blocks```, and `- ` / `1. ` lists.
 * Kept here (rather than in LessonPanel) so i18n-driven copy in HomePage,
 * CourseComplete, etc. can render the same inline markup.
 */

const codeStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '0.85em',
  background: 'var(--color-base)',
  padding: '1px 4px',
  borderRadius: '3px',
  border: '1px solid var(--color-border-subtle)',
}

export function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      parts.push(<strong key={i++} style={{ color: 'var(--color-text)' }}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('*')) {
      parts.push(<em key={i++}>{tok.slice(1, -1)}</em>)
    } else {
      parts.push(<code key={i++} style={codeStyle}>{tok.slice(1, -1)}</code>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function splitBlocks(text: string): string[] {
  const blocks: string[] = []
  const lines = text.split('\n')
  let current: string[] = []
  let inFence = false

  const flush = () => {
    const s = current.join('\n').trim()
    if (s) blocks.push(s)
    current = []
  }

  for (const line of lines) {
    if (!inFence && line.startsWith('```')) {
      flush()
      inFence = true
      current.push(line)
    } else if (inFence) {
      current.push(line)
      if (line.startsWith('```') && current.length > 1) {
        flush()
        inFence = false
      }
    } else if (line === '') {
      flush()
    } else {
      current.push(line)
    }
  }
  flush()
  return blocks
}

export function Markdownish({ text }: { text: string }) {
  const blocks = splitBlocks(text)
  return (
    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontFamily: 'var(--font-sans)', lineHeight: 1.7 }}>
      {blocks.map((block, i) => {
        if (block.startsWith('```')) {
          const code = block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
          return (
            <pre
              key={i}
              style={{
                background: 'var(--color-base)',
                border: '1px solid var(--color-border)',
                borderRadius: '5px',
                padding: '8px 10px',
                margin: '8px 0',
                fontSize: '0.75rem',
                fontFamily: 'JetBrains Mono, monospace',
                whiteSpace: 'pre-wrap',
                overflowX: 'auto' as const,
              }}
            >
              {code}
            </pre>
          )
        }
        const lines = block.split('\n')
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <div key={i} style={{ margin: '8px 0', paddingLeft: '12px' }}>
              {lines.map((l, j) => (
                <div key={j} style={{ display: 'flex', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ color: 'var(--color-accent-orange)', flexShrink: 0 }}>→</span>
                  <span>{renderInline(l.slice(2))}</span>
                </div>
              ))}
            </div>
          )
        }
        if (lines.every((l) => /^\d+\.\s/.test(l))) {
          return (
            <div key={i} style={{ margin: '8px 0', paddingLeft: '12px' }}>
              {lines.map((l, j) => (
                <div key={j} style={{ display: 'flex', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ color: 'var(--color-accent-orange)', flexShrink: 0 }}>→</span>
                  <span>{renderInline(l.replace(/^\d+\.\s/, ''))}</span>
                </div>
              ))}
            </div>
          )
        }
        return (
          <p key={i} style={{ margin: i === 0 ? '0 0 8px' : '8px 0' }}>
            {renderInline(block)}
          </p>
        )
      })}
    </div>
  )
}
