import type { Lesson } from '../engine/types'

/**
 * Lesson 0 is the home/chooser sentinel (rendered as `<HomePage />`, not by
 * `<LessonPanel />`). The fields below exist only so `getLessonById(0)` resolves
 * and the lesson selector / routing treat "home" as a valid, lesson-free state.
 */
const lesson00: Lesson = {
  id: 0,
  title: 'Home',
  concept: '',
  initialFiles: {},
  tasks: [],
  // No workspace panels are rendered for the intro; keep `seenPanels` empty
  // so lesson 1 starts with the SQLBolt-minimal layout.
  panels: [],
}

export default lesson00
