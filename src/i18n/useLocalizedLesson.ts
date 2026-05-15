import { useTranslation } from 'react-i18next'
import type { Lesson } from '../engine/types'
import ptLessons from './lessons/pt.json'

type LessonLocale = {
  title?: string
  concept?: string
  tasks?: Array<{ prompt?: string; hint?: string }>
  quiz?: { question?: string; options?: string[]; explanation?: string }
  furtherReading?: Array<{ label?: string }>
}

const localeMap: Record<string, Record<string, LessonLocale>> = {
  pt: ptLessons as Record<string, LessonLocale>,
}

function override(translated: string | undefined, fallback: string): string {
  return translated && translated.length > 0 ? translated : fallback
}

function overrideOptional(translated: string | undefined, fallback: string | undefined): string | undefined {
  if (translated && translated.length > 0) return translated
  return fallback
}

/**
 * Non-hook helper for places that show a lesson's title outside `LessonPanel`
 * (e.g. the header lesson selector and its dropdown). Caller passes the current
 * `i18n.language` so the lookup respects the user's language toggle.
 */
export function localizedLessonTitle(lesson: Lesson, lang: string): string {
  if (lang === 'en') return lesson.title
  const map = localeMap[lang]
  return override(map?.[String(lesson.id)]?.title, lesson.title)
}

export function useLocalizedLesson(lesson: Lesson): Lesson {
  const { i18n } = useTranslation()
  const lang = i18n.language

  if (lang === 'en') return lesson

  const map = localeMap[lang]
  if (!map) return lesson

  const locale = map[String(lesson.id)]
  if (!locale) return lesson

  return {
    ...lesson,
    title: override(locale.title, lesson.title),
    concept: override(locale.concept, lesson.concept),
    tasks: lesson.tasks.map((task, i) => ({
      ...task,
      prompt: override(locale.tasks?.[i]?.prompt, task.prompt),
      hint: overrideOptional(locale.tasks?.[i]?.hint, task.hint),
    })),
    quiz: lesson.quiz
      ? {
          ...lesson.quiz,
          question: override(locale.quiz?.question, lesson.quiz.question),
          options: locale.quiz?.options?.length
            ? locale.quiz.options
            : lesson.quiz.options,
          explanation: override(locale.quiz?.explanation, lesson.quiz.explanation),
        }
      : undefined,
    furtherReading: lesson.furtherReading?.map((link, i) => ({
      ...link,
      label: override(locale.furtherReading?.[i]?.label, link.label),
    })),
  }
}
