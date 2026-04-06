import i18next from 'i18next';

const FACTS_KEY = 'tallinn_go_daily_fact';

const FACTS_COUNT = 102;

interface StoredFact {
  date: string; // YYYY-MM-DD
  index: number;
  dismissed?: boolean;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyFact(): { text: string; dismissed: boolean } {
  const today = getToday();
  const facts = i18next.t('facts', { returnObjects: true }) as string[];
  const count = Array.isArray(facts) ? facts.length : FACTS_COUNT;
  try {
    const stored = localStorage.getItem(FACTS_KEY);
    if (stored) {
      const parsed: StoredFact = JSON.parse(stored);
      if (parsed.date === today) {
        return { text: facts[parsed.index] || facts[0], dismissed: !!parsed.dismissed };
      }
    }
    // New day — pick a fresh random fact, not dismissed
    const index = Math.floor(Math.random() * count);
    localStorage.setItem(FACTS_KEY, JSON.stringify({ date: today, index, dismissed: false }));
    return { text: facts[index] || facts[0], dismissed: false };
  } catch {
    return { text: facts[0], dismissed: false };
  }
}

export function dismissDailyFact(): void {
  const today = getToday();
  try {
    const stored = localStorage.getItem(FACTS_KEY);
    if (stored) {
      const parsed: StoredFact = JSON.parse(stored);
      localStorage.setItem(FACTS_KEY, JSON.stringify({ ...parsed, date: today, dismissed: true }));
    }
  } catch { /* ignore */ }
}
