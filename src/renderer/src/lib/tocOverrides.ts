export interface TocOverrideEntry {
  title: string
  page: number
}

/**
 * Hand-verified table of contents for the few bundled textbooks whose printed
 * contents page is a scanned image (no extractable text, so it cannot be parsed
 * automatically). Keyed by `${gradeLevel}-${subjectKey}`. `page` is the 1-based
 * PDF page (printed page + the book's front-matter offset, verified by eye).
 *
 * Only needed for these specific files; every other book derives its TOC at
 * runtime from the PDF.
 */
export const TOC_OVERRIDES: Record<string, TocOverrideEntry[]> = {
  // Grade 9 Physics (offset 5)
  '9-physics': [
    { title: 'Unit 1: Vectors', page: 6 },
    { title: 'Unit 2: Motion in a Straight Line', page: 20 },
    { title: "Unit 3: Forces and Newton's Laws of Motion", page: 47 },
    { title: 'Unit 4: Work, Energy and Power', page: 92 },
    { title: 'Unit 5: Simple Machines', page: 121 },
    { title: 'Unit 6: Fluid Statics', page: 145 },
    { title: 'Unit 7: Temperature and Heat', page: 176 },
    { title: 'Unit 8: Wave Motion and Sound', page: 212 }
  ],
  // Grade 10 English (offset 5)
  '10-english': [
    { title: 'Unit 1: Sport and Fitness', page: 6 },
    { title: 'Unit 2: Health - First Aid', page: 22 },
    { title: 'Unit 3: I Like Reading!', page: 38 },
    { title: 'Unit 4: Moral Education and Personal Responsibility', page: 63 },
    { title: 'Unit 5: Advertising', page: 81 },
    { title: 'Unit 6: Drugs', page: 99 },
    { title: 'Unit 7: Natural Disasters', page: 123 },
    { title: 'Unit 8: Education', page: 145 },
    { title: 'Unit 9: Seas and Rivers', page: 159 },
    { title: 'Unit 10: Energy', page: 180 },
    { title: 'Unit 11: Applications for Jobs or College', page: 197 },
    { title: 'Unit 12: Births, Weddings and Funerals', page: 213 }
  ],
  // Grade 11 English (offset 5)
  '11-english': [
    { title: 'Unit 1: The African Union', page: 6 },
    { title: 'Unit 2: Education', page: 34 },
    { title: 'Unit 3: Traditional and Modern Medicine', page: 63 },
    { title: 'Unit 4: HIV and AIDS', page: 102 },
    { title: 'Unit 5: Tourism', page: 125 },
    { title: 'Unit 6: Fiction', page: 146 },
    { title: 'Unit 7: Weather and Climate Change', page: 172 },
    { title: 'Unit 8: Water', page: 202 },
    { title: 'Unit 9: Disability', page: 226 },
    { title: 'Unit 10: Poverty and Development', page: 253 },
    { title: 'Unit 11: NGOs', page: 271 },
    { title: 'Unit 12: Technological Advances', page: 292 }
  ],
  // Grade 12 English (offset 5)
  '12-english': [
    { title: 'Unit 1: Family Life', page: 6 },
    { title: 'Unit 2: Communication', page: 35 },
    { title: 'Unit 3: Education', page: 58 },
    { title: 'Unit 4: The Arts and Literature', page: 86 },
    { title: 'Unit 5: The United Nations', page: 108 },
    { title: 'Unit 6: Trade and Globalisation', page: 130 },
    { title: 'Unit 7: Finding a Job', page: 158 },
    { title: 'Unit 8: Human Development', page: 178 },
    { title: 'Unit 9: Tradition versus Progress', page: 200 },
    { title: 'Unit 10: Future Threats', page: 226 },
    { title: 'Unit 11: The Film Industry', page: 249 },
    { title: 'Unit 12: Class Magazine', page: 270 }
  ]
}
