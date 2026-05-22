import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/gameStore'
import { getLessonById, getLastLessonId, taskKey } from '../lessons'
import { useLocalizedLesson } from '../i18n/useLocalizedLesson'
import CourseComplete from './CourseComplete'
import { Markdownish, renderInline } from './Markdownish'

/**
 * Tracks tasks that just transitioned from undone → done so the row +
 * checkbox play a one-shot completion animation. Returns the set of keys
 * currently animating; cleared 900ms after the last transition.
 *
 * Diff is detected in an effect against the previous render's signature.
 * The effect's `setState` is intentional (this is the one-shot-animation
 * pattern), so the relevant lint rule is suppressed locally.
 */
function useJustCompleted(keys: string[], doneSet: Set<string>): Set<string> {
  const prevRef = useRef<Set<string>>(new Set())
  const [animating, setAnimating] = useState<Set<string>>(new Set())
  const sig = keys.filter((k) => doneSet.has(k)).join('|')

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    const currentDone = new Set(keys.filter((k) => doneSet.has(k)))
    const newlyDone: string[] = []
    for (const k of currentDone) {
      if (!prevRef.current.has(k)) newlyDone.push(k)
    }
    prevRef.current = currentDone
    if (newlyDone.length === 0) return
    setAnimating(new Set(newlyDone))
    const t = window.setTimeout(() => setAnimating(new Set()), 900)
    return () => window.clearTimeout(t)
  }, [sig])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  return animating
}

export default function LessonPanel() {
  const currentLessonId = useGameStore((s) => s.currentLessonId)
  const completedTasks = useGameStore((s) => s.completedTasks)
  const revealedHints = useGameStore((s) => s.revealedHints)
  const correctQuizzes = useGameStore((s) => s.correctQuizzes)
  const revealHint = useGameStore((s) => s.revealHint)
  const markQuizCorrect = useGameStore((s) => s.markQuizCorrect)
  const loadLesson = useGameStore((s) => s.loadLesson)

  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo(0, 0) }, [currentLessonId])

  const rawLesson = getLessonById(currentLessonId)
  const lesson = useLocalizedLesson(rawLesson ?? { id: 0, title: '', concept: '', initialFiles: {}, tasks: [] })

  // Compute hook inputs unconditionally so hook order stays stable even when
  // `rawLesson` is null and we render nothing.
  const taskKeys = lesson.tasks.map((t) => taskKey(lesson.id, t.id))
  const justDone = useJustCompleted(taskKeys, completedTasks)

  if (!rawLesson) return null

  const allTasksDone = lesson.tasks.every((t) =>
    completedTasks.has(taskKey(lesson.id, t.id)),
  )
  const isLast = lesson.id === getLastLessonId()

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-surface)' }}>
      {/* Header: anchored by a 2px orange accent rail on the left, so the
          lesson title clearly outranks file-tree / DAG chrome of the same hue. */}
      <div
        className="shrink-0"
        style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid var(--color-border)',
          borderLeft: '2px solid var(--color-accent-orange)',
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span
            style={{
              background: 'var(--color-accent-bg)',
              border: '1px solid var(--color-accent-orange-dim)',
              color: 'var(--color-accent-orange)',
              fontSize: '0.625rem',
              fontFamily: 'JetBrains Mono, monospace',
              padding: '2px 7px',
              borderRadius: '3px',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              fontWeight: 600,
            }}
          >
            {t('lessonPanel.badge', { current: lesson.id, total: getLastLessonId() })}
          </span>
        </div>
        <h2 style={{ margin: 0, color: 'var(--color-text)', fontSize: '1.125rem', fontFamily: 'var(--font-sans)', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.005em' }}>
          {lesson.title}
        </h2>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Concept */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <Markdownish text={lesson.concept} />
          {lesson.id === 0 && <WorkspaceDiagram />}
        </div>

        {/* Tasks */}
        {lesson.tasks.length > 0 && (
        <div style={{ padding: '16px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <SectionLabel accent>{t('lessonPanel.tasks')}</SectionLabel>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {lesson.tasks.map((task, i) => {
              const key = taskKey(lesson.id, task.id)
              const done = completedTasks.has(key)
              const animateNow = justDone.has(key)
              const hintShown = revealedHints.has(key)
              return (
                <li
                  key={task.id}
                  className={animateNow ? 'task-row-glow' : undefined}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    padding: '10px 12px',
                    background: done ? 'var(--color-success-bg)' : 'transparent',
                    border: `1px solid ${done ? 'var(--color-success-border)' : 'var(--color-border-subtle)'}`,
                    borderRadius: '6px',
                    transition: 'background-color 200ms ease, border-color 200ms ease',
                  }}
                >
                  <CheckBox done={done} index={i + 1} animate={animateNow} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--color-text)', fontSize: '0.875rem', fontFamily: 'var(--font-sans)', lineHeight: 1.55 }}>
                      <Markdownish text={task.prompt} />
                    </div>
                    {task.hint && !done && (
                      <div style={{ marginTop: '6px' }}>
                        {hintShown ? (
                          <div style={{
                            background: 'var(--color-hint-bg)',
                            border: '1px solid var(--color-warning)',
                            borderRadius: '4px',
                            padding: '6px 9px',
                            color: 'var(--color-text-secondary)',
                            fontSize: '0.75rem',
                            fontFamily: 'JetBrains Mono, monospace',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {task.hint}
                          </div>
                        ) : (
                          <button
                            onClick={() => revealHint(lesson.id, task.id)}
                            style={{
                              background: 'transparent',
                              border: '1px dashed var(--color-border)',
                              borderRadius: '4px',
                              color: 'var(--color-text-muted)',
                              fontSize: '0.6875rem',
                              fontFamily: 'var(--font-sans)',
                              padding: '3px 8px',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'var(--color-muted)'
                              e.currentTarget.style.color = 'var(--color-text)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--color-border)'
                              e.currentTarget.style.color = 'var(--color-text-muted)'
                            }}
                          >
                            {t('lessonPanel.showHint')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
        )}

        {/* Further reading */}
        {lesson.furtherReading && lesson.furtherReading.length > 0 && (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <SectionLabel>{t('lessonPanel.furtherReading')}</SectionLabel>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {lesson.furtherReading.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: 'var(--color-accent-orange)',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-sans)',
                      textDecoration: 'none',
                      lineHeight: 1.5,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                  >
                    <span>{link.label}</span>
                    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M6 3h7v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M13 3L7 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <path d="M11 8v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quiz */}
        {lesson.quiz && allTasksDone && (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <SectionLabel>{t('lessonPanel.quiz')}</SectionLabel>
            <QuizBlock
              key={lesson.id}
              question={lesson.quiz.question}
              options={lesson.quiz.options}
              correctIndex={lesson.quiz.correctIndex}
              explanation={lesson.quiz.explanation}
              alreadyCorrect={correctQuizzes.has(lesson.id)}
              onCorrect={() => markQuizCorrect(lesson.id)}
            />
          </div>
        )}

        {/* Next */}
        {allTasksDone && (
          <div style={{ padding: '14px 16px' }}>
            {isLast ? (
              <CourseComplete />
            ) : (
              <button
                onClick={() => void loadLesson(lesson.id + 1)}
                className="btn-primary"
                style={{
                  width: '100%',
                  fontSize: '0.875rem',
                  padding: '11px',
                }}
              >
                {t('lessonPanel.nextLesson')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkspaceDiagram() {
  const { t } = useTranslation()
  const items: { tag: string; title: string; body: string }[] = [
    { tag: 'left', title: t('workspaceTour.files.title'), body: t('workspaceTour.files.body') },
    { tag: 'center', title: t('workspaceTour.editor.title'), body: t('workspaceTour.editor.body') },
    { tag: 'bottom', title: t('workspaceTour.terminal.title'), body: t('workspaceTour.terminal.body') },
    { tag: 'right', title: t('workspaceTour.lesson.title'), body: t('workspaceTour.lesson.body') },
  ]
  return (
    <div style={{ marginTop: '14px' }}>
      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          background: 'var(--color-base)',
          padding: '10px',
          display: 'grid',
          gridTemplateColumns: '70px 1fr 70px',
          gridTemplateRows: '70px 40px',
          gap: '6px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.5625rem',
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.08em',
        }}
      >
        <Cell label={`① ${t('workspaceTour.files.title')}`} />
        <Cell label={`② ${t('workspaceTour.editor.title')}`} emphasis />
        <Cell label={`④ ${t('workspaceTour.lesson.title')}`} />
        <div style={{ gridColumn: '1 / 4' }}>
          <Cell label={`③ ${t('workspaceTour.terminal.title')}`} full />
        </div>
      </div>
      <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((it, i) => (
          <li key={it.tag} style={{ display: 'flex', gap: '10px' }}>
            <span
              style={{
                flexShrink: 0,
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: 'var(--color-accent-bg)',
                border: '1px solid var(--color-accent-orange-dim)',
                color: 'var(--color-accent-orange)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.625rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '1px',
              }}
            >
              {i + 1}
            </span>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', fontFamily: 'var(--font-sans)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--color-text)' }}>{it.title}.</strong> {it.body}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Cell({ label, emphasis, full }: { label: string; emphasis?: boolean; full?: boolean }) {
  return (
    <div
      style={{
        height: full ? '40px' : undefined,
        background: emphasis ? 'var(--color-accent-bg)' : 'var(--color-surface)',
        border: `1px solid ${emphasis ? 'var(--color-accent-orange-dim)' : 'var(--color-border)'}`,
        borderRadius: '5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px',
        textAlign: 'center' as const,
        color: emphasis ? 'var(--color-accent-orange)' : 'var(--color-text-muted)',
      }}
    >
      {label}
    </div>
  )
}

function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        color: accent ? 'var(--color-accent-orange)' : 'var(--color-text-muted)',
        fontSize: '0.6875rem',
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.12em',
        marginBottom: '12px',
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  )
}

function CheckBox({ done, index, animate }: { done: boolean; index: number; animate?: boolean }) {
  return (
    <span
      className={animate ? 'task-check-pop' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        flexShrink: 0,
        border: `1.5px solid ${done ? 'var(--color-success)' : 'var(--color-border)'}`,
        borderRadius: '50%',
        background: done ? 'var(--color-success)' : 'transparent',
        color: done ? 'var(--color-on-success)' : 'var(--color-text-muted)',
        fontSize: '0.6875rem',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        marginTop: '1px',
        transition: 'background-color 200ms ease, border-color 200ms ease, color 200ms ease',
      }}
    >
      {done ? (
        <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
          <path d="M2 5.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        index
      )}
    </span>
  )
}

function QuizBlock({
  question,
  options,
  correctIndex,
  explanation,
  alreadyCorrect,
  onCorrect,
}: {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  alreadyCorrect: boolean
  onCorrect: () => void
}) {
  const [picked, setPicked] = useState<number | null>(alreadyCorrect ? correctIndex : null)
  const isCorrect = picked === correctIndex

  return (
    <div>
      <div style={{ color: 'var(--color-text)', fontSize: '0.8125rem', fontFamily: 'var(--font-sans)', lineHeight: 1.5, marginBottom: '10px' }}>
        {renderInline(question)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {options.map((opt, i) => {
          const selected = picked === i
          const showResult = picked !== null
          const isThisCorrect = i === correctIndex
          let border = 'var(--color-border)'
          let bg = 'transparent'
          if (showResult && selected) {
            border = isThisCorrect ? 'var(--color-success)' : 'var(--color-warning)'
            bg = isThisCorrect ? 'var(--color-success-bg)' : 'var(--color-hint-bg)'
          } else if (showResult && isThisCorrect) {
            border = 'var(--color-success)'
            bg = 'var(--color-success-bg)'
          }
          return (
            <button
              key={i}
              onClick={() => {
                if (picked !== null && isCorrect) return
                setPicked(i)
                if (i === correctIndex) onCorrect()
              }}
              style={{
                textAlign: 'left' as const,
                padding: '8px 10px',
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: '5px',
                color: 'var(--color-text)',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
              }}
            >
              {renderInline(opt)}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div
          key={picked}
          className="quiz-explain-in"
          style={{
            marginTop: '10px',
            padding: '8px 10px',
            border: `1px solid ${isCorrect ? 'var(--color-success-border)' : 'var(--color-border)'}`,
            background: isCorrect ? 'var(--color-success-bg)' : 'transparent',
            borderRadius: '5px',
            color: 'var(--color-text-secondary)',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.5,
          }}
        >
          {isCorrect ? '✓ ' : ''}{renderInline(explanation)}
        </div>
      )}
    </div>
  )
}

