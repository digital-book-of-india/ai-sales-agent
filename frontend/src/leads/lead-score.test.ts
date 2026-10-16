import { describe, expect, it } from 'vitest'
import { getLeadScoreCategory } from './lead-score'

describe('getLeadScoreCategory', () => {
  it('categorizes the fixed HOT/WARM/COLD/LOW bands', () => {
    expect(getLeadScoreCategory(100)).toBe('HOT')
    expect(getLeadScoreCategory(90)).toBe('HOT')
    expect(getLeadScoreCategory(89)).toBe('WARM')
    expect(getLeadScoreCategory(70)).toBe('WARM')
    expect(getLeadScoreCategory(69)).toBe('COLD')
    expect(getLeadScoreCategory(40)).toBe('COLD')
    expect(getLeadScoreCategory(39)).toBe('LOW')
    expect(getLeadScoreCategory(0)).toBe('LOW')
  })
})
