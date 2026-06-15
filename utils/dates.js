const BlockedDate = require('../models/BlockedDate');

const dayNames = {
  ua: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
};

const monthNames = {
  ua: [
    'Січень',
    'Лютий',
    'Березень',
    'Квітень',
    'Травень',
    'Червень',
    'Липень',
    'Серпень',
    'Вересень',
    'Жовтень',
    'Листопад',
    'Грудень',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  ru: [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ],
};

// Генерация 7 дней конкретной недели для инлайн-календаря кубиками
async function getWeekDaysForCalendar(
  lang = 'ua',
  startOfWeekDate = new Date(),
) {
  const now = new Date();
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Вычисляем понедельник для запрашиваемой даты
  const current = new Date(startOfWeekDate);
  const dayOfWeek = current.getDay();
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(
    current.setDate(current.getDate() + distanceToMonday),
  );

  // Вытягиваем из базы все заблокированные админом даты
  const blockedEntries = await BlockedDate.find({});
  const blockedDatesSet = new Set(blockedEntries.map(b => b.dateStr));

  const days = [];

  // Генерируем дни строго от Понедельника до Воскресенья
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);

    const dayIndex = date.getDay();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    // День считается закрытым, если он в прошлом ИЛИ заблокирован вручную админом
    const isPast = date < todayZero;
    const isBlockedByAdmin = blockedDatesSet.has(dateStr);

    days.push({
      dayLabel: dayNames[lang][dayIndex],
      dayNum: date.getDate(),
      dateStr,
      isPast,
      isBlockedByAdmin, // Передаем этот флаг отдельно, чтобы админ-панель видела ручные блокировки
    });
  }

  // Расчет навигации для стрелочек
  const prevWeekMonday = new Date(monday);
  prevWeekMonday.setDate(monday.getDate() - 7);

  const nextWeekMonday = new Date(monday);
  nextWeekMonday.setDate(monday.getDate() + 7);

  const endOfPrevWeek = new Date(prevWeekMonday);
  endOfPrevWeek.setDate(prevWeekMonday.getDate() + 6);
  const isPrevWeekPast = endOfPrevWeek < todayZero;

  return {
    headerTitle: `${monthNames[lang][monday.getMonth()]} ${monday.getFullYear()}`,
    days,
    prevWeekStr: `${prevWeekMonday.getFullYear()}-${prevWeekMonday.getMonth() + 1}-${prevWeekMonday.getDate()}`,
    nextWeekStr: `${nextWeekMonday.getFullYear()}-${nextWeekMonday.getMonth() + 1}-${nextWeekMonday.getDate()}`,
    isPrevWeekPast,
  };
}

function getAvailableTimes(lang = 'ua', selectedDate = null) {
  const now = new Date();
  const hour = now.getHours();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = selectedDate === todayStr;

  return [
    {
      label: { ua: 'До 12pm', en: 'Before 12pm', ru: 'До 12pm' }[lang],
      value: 'before_12',
      isPast: isToday && hour >= 12,
    },
    {
      label: { ua: '12pm – 4pm', en: '12pm – 4pm', ru: '12pm – 4pm' }[lang],
      value: 'noon_to_16',
      isPast: isToday && hour >= 16,
    },
    {
      label: { ua: 'Після 4pm', en: 'After 4pm', ru: 'После 4pm' }[lang],
      value: 'after_16',
      isPast: false,
    },
  ];
}

module.exports = { getAvailableTimes, getWeekDaysForCalendar };
