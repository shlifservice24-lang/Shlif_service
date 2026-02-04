# 🚗 STO Braclavec - Система Управління СТО

Веб-додаток для управління автосервісом (СТО) з функціоналом обліку замовлень, складу, бухгалтерії та планування робіт.

## 📋 Основні функції

- ✅ **Управління замовленнями** - створення та відстеження актів робіт
- 📦 **Облік складу** - управління деталями та матеріалами
- 💰 **Бухгалтерія** - облік зарплат, витрат та доходів
- 📅 **Планування** - календар робіт та завдань
- 👥 **Управління користувачами** - різні рівні доступу (Адміністратор, Приймальник, Слюсар, Магазин)
- 📊 **Звіти та аналітика** - детальна статистика роботи СТО
- 🔄 **Пакетний імпорт** - завантаження даних з Excel/CSV
- 🔐 **Google OAuth** - безпечна авторизація через Google

## 🛠️ Технології

- **Frontend**: TypeScript, Vite, SCSS
- **Backend**: Supabase (PostgreSQL, Authentication, Storage)
- **Deployment**: Vercel / GitHub Pages
- **Build Tool**: Vite
- **Package Manager**: npm

## 📦 Встановлення

### Передумови

- Node.js (версія 18 або вище)
- npm або yarn
- Git
- Акаунт Supabase
- Акаунт Google Cloud (для OAuth)

### Крок 1: Клонування репозиторію

```bash
git clone https://github.com/shlifservice24-lang/Shlif_service.git
cd Shlif_service
```

### Крок 2: Встановлення залежностей

```bash
npm install
```

### Крок 3: Налаштування змінних середовища

1. Скопіюйте `.env.example` в `.env` та `.env.local`:

```bash
cp .env.example .env
cp .env.example .env.local
```

2. Відредагуйте `.env` та `.env.local`, заповнивши наступні дані:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_KEY=your-supabase-anon-key

# Google OAuth
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### Крок 4: Налаштування Supabase

1. Створіть новий проект на [Supabase](https://supabase.com)
2. Виконайте міграції з папки `supabase/migrations/`
3. Налаштуйте Authentication → Providers → Google OAuth
4. Додайте Redirect URLs:
   - `http://localhost:5173` (для розробки)
   - `https://your-domain.com` (для продакшену)

### Крок 5: Налаштування Google OAuth

1. Перейдіть в [Google Cloud Console](https://console.cloud.google.com)
2. Створіть новий проект або виберіть існуючий
3. Увімкніть Google+ API
4. Створіть OAuth 2.0 Client ID
5. Додайте Authorized redirect URIs:
   - `https://your-project-id.supabase.co/auth/v1/callback`

## 🚀 Запуск проекту

### Режим розробки

```bash
npm run dev
```

Додаток буде доступний за адресою: `http://localhost:5173`

### Збірка для продакшену

```bash
npm run build
```

### Попередній перегляд збірки

```bash
npm run preview
```

## 📤 Deployment

### Vercel

```bash
# Встановіть Vercel CLI (якщо ще не встановлено)
npm i -g vercel

# Деплой на Vercel
npm run vercel:prod
```

### GitHub Pages

```bash
# Деплой на GitHub Pages
npm run deploy
```

## 📁 Структура проекту

```
STO/
├── src/
│   ├── ts/              # TypeScript файли
│   │   ├── roboha/      # Основна логіка додатку
│   │   └── ...
│   ├── scss/            # Стилі SCSS
│   └── ...
├── public/              # Статичні файли
├── supabase/            # Міграції та конфігурація Supabase
├── dist/                # Збірка (генерується автоматично)
├── main.html            # Головна сторінка
├── bukhhalteriya.html   # Сторінка бухгалтерії
├── planyvannya.html     # Сторінка планування
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## 🔧 Скрипти

- `npm run dev` - запуск dev сервера
- `npm run build` - збірка проекту
- `npm run build:github` - збірка для GitHub Pages
- `npm run build:vercel` - збірка для Vercel
- `npm run preview` - попередній перегляд збірки
- `npm run lint` - перевірка коду ESLint
- `npm run deploy` - деплой на GitHub Pages
- `npm run vercel:prod` - деплой на Vercel (production)

## 🔐 Безпека

⚠️ **ВАЖЛИВО**: Ніколи не комітьте файли з чутливими даними:

- `.env`
- `.env.local`
- `deploy-*.ps1`
- Файли з API ключами

Ці файли вже додані в `.gitignore`.

## 🤝 Внесок

Якщо ви хочете внести свій внесок у проект:

1. Зробіть Fork репозиторію
2. Створіть нову гілку (`git checkout -b feature/AmazingFeature`)
3. Закомітьте зміни (`git commit -m 'Add some AmazingFeature'`)
4. Запуште гілку (`git push origin feature/AmazingFeature`)
5. Відкрийте Pull Request

## 📝 Ліцензія

Цей проект є приватним і призначений для внутрішнього використання.

## 📧 Контакти

Для питань та підтримки звертайтесь до розробників проекту.

---

**Розроблено з ❤️ для СТО Braclavec**
