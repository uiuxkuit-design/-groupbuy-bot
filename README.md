# Telegram Group-Buy Bot v2

## Tezkor ishga tushirish

### 1. Railway (bepul, tavsiya)
```
1. railway.app → New Project → Deploy from GitHub
2. .env o'zgaruvchilarini qo'shing
3. WEBHOOK_URL = https://your-app.railway.app
4. Deploy
```

### 2. Local (test uchun)
```bash
cp .env.example .env   # to'ldiring
# WEBHOOK_URL ni bo'sh qoldiring → polling ishlatiladi
npm install
npm run dev
```

### 3. Docker
```bash
cp .env.example .env
docker-compose up -d
```

## .env o'zgaruvchilari
| Kalit | Tavsif |
|---|---|
| BOT_TOKEN | @BotFather dan |
| ADMIN_IDS | Admin Telegram ID lari, vergul bilan |
| GROUP_CHAT_ID | Guruh chat ID (-100...) |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_SERVICE_KEY | Service role key |
| WEBHOOK_URL | Production URL (Railway link) |
| DEFAULT_LANG | uz yoki ru |

## Admin buyruqlar
| Buyruq | Tavsif |
|---|---|
| /admin | Admin panel |
| /newproduct | Yangi mahsulot |
| /export | Buyurtmalarni CSV yuklab olish |
| /broadcast `xabar` | Barcha userlarga xabar |
| /runreminders | Eslatmalarni qo'lda ishga tushirish |

## Supabase
```
SQL Editor → schema.sql → Run
SQL Editor → schema_additions.sql → Run
```
