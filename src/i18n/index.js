const messages = {
  uz: {
    welcome:          (name) => `👋 Salom, *${name}!*\n\n📦 Guruh buyurtma botiga xush kelibsiz!\n\n/mahsulotlar — Mahsulotlar\n/buyurtmalarim — Buyurtmalarim\n/yordam — Yordam`,
    help:             `📖 *Yordam*\n\n1. Guruhda *Buyurtma berish* bosing\n2. O'lcham, rang, miqdor tanlang\n3. To'lovni amalga oshiring\n4. Chekni yuboring\n5. Tasdiqni kuting ✅`,
    orderNow:         '🛒 Buyurtma berish',
    waitingList:      "⏳ Kutish ro'yxati",
    chooseSize:       '👕 O\'lcham tanlang:',
    chooseColor:      '🎨 Rang tanlang:',
    chooseQty:        '🔢 Miqdor tanlang:',
    orderPlaced:      (name, series, price) => `✅ *Buyurtma qabul qilindi!*\n\n📦 ${name}\n📊 Seriya #${series}\n💰 ${price}\n\nTo'lov qiling va chekni yuboring.`,
    uploadPayment:    '📎 Chek yuborish',
    cancelOrder:      '❌ Bekor qilish',
    myOrders:         '📋 Buyurtmalarim',
    seriesClosed:     (n, next) => `🔒 *SERIYA #${n} — YOPILDI!*\n\n✅ To'liq to'ldirildi!\n\n🟢 *Seriya #${next} ochildi!*`,
    seriesProgress:   (cur, total) => `📊 ${cur}/${total} to'plandi`,
    waitJoined:       (pos) => `⏳ Kutish ro'yxatiga qo'shildingiz!\n📍 Siz *#${pos}* o'rindasyiz.`,
    waitPromoted:     (name, price) => `🎉 *Tabriklaymiz!*\n\n📦 ${name}\n💰 ${price}\n\n⏰ 24 soat ichida to'lang!`,
    paymentReminder1: (name, price) => `💳 *Eslatma*\n\n📦 ${name}\n💰 ${price}\n\nTo'lovni kutmoqda.`,
    paymentReminder2: (name, price) => `⚠️ *2-eslatma*\n\n📦 ${name}\n💰 ${price}\n\nTez orada bekor bo'lishi mumkin.`,
    paymentReminder3: (name, price) => `🚨 *Oxirgi ogohlantirish!*\n\n📦 ${name}\n💰 ${price}\n\n48 soat o'tdi!`,
    paymentApproved:  (name, series) => `✅ *To'lov tasdiqlandi!*\n\n📦 ${name}\n📊 Seriya #${series}\n\nRahmat! 🎉`,
    paymentRejected:  (reason) => `❌ *To'lov rad etildi*\n\n📝 ${reason}\n\nQayta urinib ko'ring.`,
    orderCancelled:   '❌ *Buyurtma bekor qilindi.*',
    noOrders:         "📭 Hali buyurtma yo'q.",
    noSeries:         "⏸ Hozir aktiv seriya yo'q.",
    deadline48:       (name, h) => `⏳ *${h} soat qoldi!*\n\n📦 ${name}`,
    deadline6:        (name) => `🔥 *6 soat qoldi!*\n\n📦 ${name}`,
    back:             '◀️ Ortga',
    cancel:           '❌ Bekor',
    done:             '✅ Tayyor',
    chooseLang:       '🌐 Tilni tanlang:',
    langSet:          "✅ Til o'rnatildi: 🇺🇿 O'zbek",
  },
  ru: {
    welcome:          (name) => `👋 Привет, *${name}!*\n\n📦 Добро пожаловать в бот групповых закупок!\n\n/products — Товары\n/myorders — Мои заказы\n/help — Помощь`,
    help:             `📖 *Помощь*\n\n1. Нажмите *Заказать* в группе\n2. Выберите размер, цвет, количество\n3. Оплатите\n4. Отправьте чек\n5. Ждите подтверждения ✅`,
    orderNow:         '🛒 Заказать',
    waitingList:      '⏳ Лист ожидания',
    chooseSize:       '👕 Выберите размер:',
    chooseColor:      '🎨 Выберите цвет:',
    chooseQty:        '🔢 Выберите количество:',
    orderPlaced:      (name, series, price) => `✅ *Заказ принят!*\n\n📦 ${name}\n📊 Серия #${series}\n💰 ${price}\n\nОплатите и отправьте чек.`,
    uploadPayment:    '📎 Отправить чек',
    cancelOrder:      '❌ Отменить',
    myOrders:         '📋 Мои заказы',
    seriesClosed:     (n, next) => `🔒 *СЕРИЯ #${n} — ЗАКРЫТА!*\n\n✅ Заполнена!\n\n🟢 *Серия #${next} открыта!*`,
    seriesProgress:   (cur, total) => `📊 ${cur}/${total} собрано`,
    waitJoined:       (pos) => `⏳ Вы в листе ожидания!\n📍 Место *#${pos}*.`,
    waitPromoted:     (name, price) => `🎉 *Поздравляем!*\n\n📦 ${name}\n💰 ${price}\n\n⏰ Оплатите за 24 часа!`,
    paymentReminder1: (name, price) => `💳 *Напоминание*\n\n📦 ${name}\n💰 ${price}\n\nОжидает оплаты.`,
    paymentReminder2: (name, price) => `⚠️ *2-е напоминание*\n\n📦 ${name}\n💰 ${price}\n\nМожет быть отменён.`,
    paymentReminder3: (name, price) => `🚨 *Последнее предупреждение!*\n\n📦 ${name}\n💰 ${price}\n\n48 часов прошло!`,
    paymentApproved:  (name, series) => `✅ *Оплата подтверждена!*\n\n📦 ${name}\n📊 Серия #${series}\n\nСпасибо! 🎉`,
    paymentRejected:  (reason) => `❌ *Отклонено*\n\n📝 ${reason}\n\nПопробуйте ещё раз.`,
    orderCancelled:   '❌ *Заказ отменён.*',
    noOrders:         '📭 Заказов пока нет.',
    noSeries:         '⏸ Нет активных серий.',
    deadline48:       (name, h) => `⏳ *Осталось ${h} ч!*\n\n📦 ${name}`,
    deadline6:        (name) => `🔥 *Осталось 6 часов!*\n\n📦 ${name}`,
    back:             '◀️ Назад',
    cancel:           '❌ Отмена',
    done:             '✅ Готово',
    chooseLang:       '🌐 Выберите язык:',
    langSet:          '✅ Язык установлен: 🇷🇺 Русский',
  },
};

const cache = new Map();

export function t(lang, key, ...args) {
  const m = messages[lang] ?? messages.uz;
  const v = m[key] ?? messages.uz[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
export const getLang   = (id) => cache.get(id) ?? 'uz';
export const setLang   = (id, lang) => { if (messages[lang]) cache.set(id, lang); };
export const LANGS     = { uz: "🇺🇿 O'zbek", ru: '🇷🇺 Русский' };
