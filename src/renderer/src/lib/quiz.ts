import type { Question } from '@shared/types'

/**
 * Options whose meaning depends on position, shuffling these would break them.
 * e.g. "All of the above", "None of the above", "Both A and B", "A and C".
 */
const POSITION_DEPENDENT =
  /\b(?:above|below)\b|\ball of the\b|\bnone of the\b|\bboth\b|\bneither\b|\b[a-d]\s+and\s+[a-d]\b/i

function isShuffleable(q: Question): boolean {
  if (q.type !== 'mcq') return false
  if (!Array.isArray(q.options) || q.options.length < 2) return false
  return !q.options.some((o) => POSITION_DEPENDENT.test(String(o)))
}

/**
 * Randomise the order of an MCQ's options and remap the answer index, so the
 * correct choice isn't always in the same slot (authored/AI questions tend to
 * cluster the key on one letter). Non-choice or position-dependent questions
 * ("all of the above", etc.) are returned unchanged. Call once per sitting.
 */
export function shuffleQuestionOptions(q: Question): Question {
  if (!isShuffleable(q)) return q
  const correct = Number(q.answer)
  if (!Number.isInteger(correct) || correct < 0 || correct >= q.options.length) return q
  const order = q.options.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    answer: String(order.indexOf(correct))
  }
}
