import type { Lesson } from '../engine/types'
import lesson00 from './lesson00'
import lesson01 from './lesson01'
import lesson02 from './lesson02'
import lesson03 from './lesson03'
import lesson04 from './lesson04'
import lesson05 from './lesson05'
import lesson06 from './lesson06'
import lesson07 from './lesson07'
import lesson08 from './lesson08'
import lesson09 from './lesson09'
import lesson10 from './lesson10'
import lesson11 from './lesson11'
import lesson12 from './lesson12'
import lesson13 from './lesson13'
import lesson14 from './lesson14'

export const lessons: Lesson[] = [
  lesson00,
  lesson01,
  lesson02,
  lesson03,
  lesson04,
  lesson05,
  lesson06,
  lesson07,
  lesson08,
  lesson09,
  lesson10,
  lesson11,
  lesson12,
  lesson13,
  lesson14,
]

export function getLessonById(id: number): Lesson | undefined {
  return lessons.find((l) => l.id === id)
}

export function getLastLessonId(): number {
  return lessons.reduce((max, l) => (l.id > max ? l.id : max), 0)
}

/** Stable key for a task's progress entry: `<lessonId>.<taskId>`. */
export function taskKey(lessonId: number, taskId: string): string {
  return `${lessonId}.${taskId}`
}
