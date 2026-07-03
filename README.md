# StayTrue — Accountability App 🎯

> A modern, privacy-focused accountability platform where you set goals, track progress, and stay motivated with friends or anonymous buddies.

---

## 🌟 Features

### Goal Management
- **Create & track goals** across categories: Fitness, Learning, Mindfulness, Finance, Career
- **Flexible check-in cadence**: Daily, 3× per week, or weekly
- **Visual progress tracking**: Contribution heatmap (GitHub-style) for at-a-glance streaks
- **Smart reminders**: Daily push notifications if you haven't checked in (opt-in)

### Accountability Buddies
- **Friend matching**: Send buddy requests to friends via username search
- **Stranger matching**: Instant pairing with someone in the same goal category
- **Goal chat**: Private messaging and quick reactions (🔥, 💪, 👏, 🎉, ⚡, 💯)
- **Real-time updates**: See when your buddy checks in or sends a message

### Gamification & Motivation
- **Streak tracking**: Current streak, longest streak, total check-ins
- **Badge system**: Earn badges for milestones (First Goal, 7-day streak, Marathoner, etc.)
- **Public profiles**: Share your achievements at `/u/yourusername` (opt-in)

### Modern PWA Experience
- **Offline-first**: Install as a mobile app (iOS & Android)
- **Dark mode**: Auto-syncs with system preference
- **Responsive design**: Seamless on desktop, tablet, and mobile
- **Smooth animations**: Framer Motion for polished interactions

---

## 📸 Screenshots

> _Add screenshots here after deployment_

| Dashboard | Goal Detail | Buddy Chat |
|-----------|-------------|------------|
| ![Dashboard placeholder](https://via.placeholder.com/300x200?text=Dashboard) | ![Goal Detail placeholder](https://via.placeholder.com/300x200?text=Goal+Detail) | ![Chat placeholder](https://via.placeholder.com/300x200?text=Chat) |

---

## 🚀 Tech Stack

### Frontend
- **React 19** + **TypeScript 6** — Modern, type-safe React
- **Vite 8** — Lightning-fast dev server and build tool
- **TanStack Query** — Powerful data fetching and caching
- **React Router 7** — Client-side routing with data loaders
- **Zustand** — Lightweight state management
- **Tailwind CSS 4** — Utility-first styling
- **Framer Motion** — Declarative animations
- **DOMPurify** — XSS protection for user input

### Backend
- **Supabase** — PostgreSQL database, authentication, realtime, storage
- **Edge Functions** (Deno) — Serverless push notifications
- **Row Level Security (RLS)** — Database-level authorization
- **pg_cron** — Scheduled daily reminders

### DevOps
- **Vercel** — Instant deployments with serverless functions
- **GitHub Actions** (optional) — CI/CD pipeline
- **Oxlint** — Fast linting for code quality

---

## 🛠️ Local Setup

### Prerequisites
- **Node.js 20+** (LTS recommended)
- **npm** or **pnpm**
- **Supabase account** (free tier works great)

### 1. Clone the repository
```bash
git clone https://github.com/the-grandmaster0/staytrue.git
cd staytrue
npm install
```

### 2. Set up Supabase

#### Create a project
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Note your **Project URL** and **Anon Key** (Settings → API)

#### Run database migrations
Open the Supabase SQL Editor and run these files **in order**:

```sql
-- 1. Core schema (profiles, goals, checkins, buddy_requests)
-- Paste contents of supabase_setup.sql (not included, create from your DB)

-- 2. Profile system & badges
-- Paste contents of profile_system.sql

-- 3. Messaging system
-- Paste contents of messages.sql

-- 4. Push notifications
-- Paste contents of push_notifications.sql

-- 5. Stranger matching
-- Paste contents of stranger_matching.sql

-- 6. RLS policies (CRITICAL for security)
-- Paste contents of supabase/migrations/rls_policies.sql
```

#### Enable Realtime (for chat)
1. Go to Database → Replication
2. Toggle ON for `messages` table

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_VAPID_PUBLIC_KEY=BF6w...  # Optional, for push notifications
```

### 4. (Optional) Set up push notifications

#### Generate VAPID keys
```bash
npx web-push generate-vapid-keys
```

#### Add secrets to Supabase
```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-id

# Set secrets
supabase secrets set VAPID_PUBLIC_KEY="BF6w..."
supabase secrets set VAPID_PRIVATE_KEY="a3s..."
supabase secrets set VAPID_SUBJECT="mailto:you@example.com"
```

#### Deploy Edge Functions
```bash
supabase functions deploy send-push
supabase functions deploy daily-reminder
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📦 Production Deployment

### Deploy to Vercel (recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Select your GitHub repo
   - Add environment variables:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_VAPID_PUBLIC_KEY` (optional)
   - Click **Deploy**

3. **Verify**
   - Open your deployed URL
   - Sign up for a test account
   - Create a goal and check in

### Build locally

```bash
npm run build
```

Output is in `dist/` — upload to any static host (Netlify, Cloudflare Pages, etc.)

---

## 🗂️ Project Structure

```
accountability-app/
├── public/                 # Static assets (PWA icons, manifest)
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── GoalCard.tsx
│   │   ├── GoalChat.tsx
│   │   ├── BuddyManager.tsx
│   │   └── ...
│   ├── pages/              # Route components
│   │   ├── Dashboard.tsx
│   │   ├── GoalDetail.tsx
│   │   ├── FindBuddy.tsx
│   │   └── ...
│   ├── hooks/              # Custom React hooks
│   │   ├── useCheckins.ts
│   │   ├── useBuddies.ts
│   │   └── useMessages.ts
│   ├── lib/                # Utilities & config
│   │   ├── supabaseClient.ts
│   │   ├── sanitize.ts     # DOMPurify XSS protection
│   │   └── env.ts          # Runtime env validation
│   ├── store/              # Zustand state management
│   ├── types/              # TypeScript definitions
│   └── App.tsx             # Root component
├── supabase/
│   ├── functions/          # Edge Functions (Deno)
│   │   ├── send-push/
│   │   └── daily-reminder/
│   └── migrations/         # Database schema
│       └── rls_policies.sql
├── .env.example            # Environment variable template
├── vercel.json             # Vercel SPA rewrite config
└── README.md               # You are here
```

---

## 🔒 Security

StayTrue follows security best practices:

- ✅ **Row Level Security (RLS)**: All database tables have RLS enabled
- ✅ **Input sanitization**: DOMPurify strips HTML/XSS from all user input
- ✅ **File upload validation**: MIME type + size checks for avatars
- ✅ **Rate limiting**: Edge Functions have in-memory rate limiters
- ✅ **Buddy verification**: Messages require an accepted buddy_request (subquery)
- ✅ **Least privilege**: Users can only access their own data + shared data


---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development workflow

```bash
# Install dependencies
npm install

# Run linter
npm run lint

# Build for production (check for errors)
npm run build
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Supabase** — Amazing open-source Firebase alternative
- **Vercel** — Best-in-class deployment platform
- **Lucide Icons** — Beautiful, consistent icon library
- **Tailwind CSS** — Utility-first CSS framework
- **The open-source community** — For making this possible

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/the-grandmaster0/staytrue/issues)
- **Discussions**: [GitHub Discussions](https://github.com/the-grandmaster0/staytrue/discussions)
- **Email**: 

---

<div align="center">

**Built with ❤️ by [Aditya Jha](https://github.com/the-grandmaster0)**

[⭐ Star this repo](https://github.com/the-grandmaster0/staytrue) if you found it helpful!

</div>
