// Bundled dates are kept separate from the UI so each year's official notice can be updated.
// 2026: 国务院办公厅关于2026年部分节假日安排的通知，国办发明电〔2025〕7号。
export const bundledHolidayYears = {
  2026: {
    source: 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm',
    holidays: [
      { name: '元旦', date: '2026-01-01', range: '1.1–1.3' },
      { name: '春节', date: '2026-02-15', range: '2.15–2.23' },
      { name: '清明节', date: '2026-04-04', range: '4.4–4.6' },
      { name: '劳动节', date: '2026-05-01', range: '5.1–5.5' },
      { name: '端午节', date: '2026-06-19', range: '6.19–6.21' },
      { name: '中秋节', date: '2026-09-25', range: '9.25–9.27' },
      { name: '国庆节', date: '2026-10-01', range: '10.1–10.7' }
    ]
  },
  2027: {
    source: '节假日放假安排待公布；仅显示节日日期',
    holidays: [
      { name: '元旦', date: '2027-01-01', range: '放假安排待公布' },
      { name: '春节', date: '2027-02-06', range: '放假安排待公布' }
    ]
  }
};

const text = (value, limit) => String(value ?? '').trim().slice(0, limit);
function validDate(value, year) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) !== Number(year)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function normalizeHolidayYears(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  for (const [key, value] of Object.entries(raw).slice(0, 12)) {
    const year = Number(key);
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Array.isArray(value?.holidays)) continue;
    const holidays = value.holidays.slice(0, 30).map(entry => ({
      name: text(entry?.name, 40), date: text(entry?.date, 10), range: text(entry?.range, 80)
    })).filter(entry => entry.name && validDate(entry.date, year));
    if (holidays.length) result[year] = { source: text(value.source, 300), holidays };
  }
  return result;
}

export function parseHolidayFile(raw) {
  const year = Number(raw?.year);
  const normalized = normalizeHolidayYears({ [year]: raw });
  if (!normalized[year]) throw new Error('节假日文件需要年份和至少一个有效日期');
  return { year, data: normalized[year] };
}

export function upcomingHolidays(overrides = {}, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const years = { ...bundledHolidayYears, ...normalizeHolidayYears(overrides) };
  return Object.values(years).flatMap(year => year.holidays).map(holiday => {
    const [y, m, d] = holiday.date.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, d) - start) / 86400000);
    return { ...holiday, days };
  }).filter(holiday => holiday.days >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
}
