// Built-in awareness days relevant to Canadian PR. Fixed dates or computed rules; all in local time.

export type AwarenessDay = { title: string; date: Date; note?: string };
type Rule = { title: string; month: number; day?: number; nth?: number; dow?: number; last?: boolean; compute?: (year: number) => Date; note?: string };

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

/** nth (1-based) weekday `dow` (0=Sun) of a month, or the last one when `last`. */
export function nthWeekday(year: number, month: number, dow: number, nth: number, last = false): Date {
  if (last) {
    const end = new Date(year, month, 0); // last day of month
    return new Date(year, month - 1, end.getDate() - ((end.getDay() - dow + 7) % 7));
  }
  const first = new Date(year, month - 1, 1);
  return new Date(year, month - 1, 1 + ((dow - first.getDay() + 7) % 7) + (nth - 1) * 7);
}

/** Giving Tuesday: the Tuesday after US Thanksgiving (fourth Thursday of November). */
export const givingTuesday = (y: number) => { const t = nthWeekday(y, 11, 4, 4); return new Date(y, 10, t.getDate() + 5); };
/** Victoria Day: the Monday before May 25. */
export const victoriaDay = (y: number) => { const m = d(y, 5, 24); return new Date(y, 4, 24 - ((m.getDay() + 6) % 7)); };

export const AWARENESS_RULES: Rule[] = [
  { title: "Bell Let's Talk Day", month: 1, dow: 3, last: true, note: "Last Wednesday of January" },
  { title: "Black History Month begins", month: 2, day: 1 },
  { title: "Heart Month begins", month: 2, day: 1 },
  { title: "World Cancer Day", month: 2, day: 4 },
  { title: "Family Day (Ontario)", month: 2, dow: 1, nth: 3 },
  { title: "Pink Shirt Day", month: 2, dow: 3, last: true, note: "Last Wednesday of February" },
  { title: "Nutrition Month begins", month: 3, day: 1 },
  { title: "International Women's Day", month: 3, day: 8 },
  { title: "International Day for the Elimination of Racial Discrimination", month: 3, day: 21 },
  { title: "World Water Day", month: 3, day: 22 },
  { title: "Daffodil Month begins", month: 4, day: 1 },
  { title: "World Autism Awareness Day", month: 4, day: 2 },
  { title: "World Health Day", month: 4, day: 7 },
  { title: "National Volunteer Week begins", month: 4, dow: 0, nth: 3, note: "Third full week of April" },
  { title: "Earth Day", month: 4, day: 22 },
  { title: "Asian Heritage Month begins", month: 5, day: 1 },
  { title: "Mental Health Week begins", month: 5, dow: 1, nth: 1, note: "First full week of May" },
  { title: "Mother's Day", month: 5, dow: 0, nth: 2 },
  { title: "Victoria Day", month: 5, compute: victoriaDay },
  { title: "National AccessAbility Week begins", month: 5, dow: 0, last: true, note: "Starts the last Sunday of May" },
  { title: "Pride Month begins", month: 6, day: 1 },
  { title: "World Environment Day", month: 6, day: 5 },
  { title: "Father's Day", month: 6, dow: 0, nth: 3 },
  { title: "National Indigenous Peoples Day", month: 6, day: 21 },
  { title: "Canada Day", month: 7, day: 1 },
  { title: "Emancipation Day", month: 8, day: 1 },
  { title: "Labour Day", month: 9, dow: 1, nth: 1 },
  { title: "World Suicide Prevention Day", month: 9, day: 10 },
  { title: "World Alzheimer's Day", month: 9, day: 21 },
  { title: "National Day for Truth and Reconciliation", month: 9, day: 30, note: "Also Orange Shirt Day" },
  { title: "Cyber Security Awareness Month begins", month: 10, day: 1 },
  { title: "World Mental Health Day", month: 10, day: 10 },
  { title: "International Day of the Girl", month: 10, day: 11 },
  { title: "Thanksgiving (Canada)", month: 10, dow: 1, nth: 2 },
  { title: "Persons Day", month: 10, day: 18 },
  { title: "Small Business Week begins", month: 10, dow: 0, nth: 3, note: "Third week of October" },
  { title: "Movember begins", month: 11, day: 1 },
  { title: "Financial Literacy Month begins", month: 11, day: 1 },
  { title: "Remembrance Day", month: 11, day: 11 },
  { title: "World Kindness Day", month: 11, day: 13 },
  { title: "National Philanthropy Day", month: 11, day: 15 },
  { title: "National Child Day", month: 11, day: 20 },
  { title: "Giving Tuesday", month: 11, compute: givingTuesday },
  { title: "International Day of Persons with Disabilities", month: 12, day: 3 },
  { title: "Human Rights Day", month: 12, day: 10 },
];

export function awarenessDaysFor(year: number): AwarenessDay[] {
  return AWARENESS_RULES.map((r) => {
    let date: Date;
    if (r.compute) date = r.compute(year);
    else if (r.day) date = d(year, r.month, r.day);
    else date = nthWeekday(year, r.month, r.dow ?? 0, r.nth ?? 1, !!r.last);
    return { title: r.title, date, note: r.note };
  }).sort((a, b) => a.date.getTime() - b.date.getTime());
}
