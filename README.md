# Café Study Spot App ☕📍

A modern React Native & Expo mobile application designed for students and remote workers to discover, rate, and navigate to top study spots and cafes around UCI, Irvine, and Costa Mesa.

---

## 🌟 Key Features

* **🔐 Authentication & Google OAuth**: Sign up using email/password or seamless Google OAuth powered by **Supabase Auth**.
* **📝 Profile Onboarding**: Mandatory profile completion flow (collecting first name, last name, and phone number) secured with Row Level Security (RLS).
* **🗺️ Interactive Map & Navigation**:
  * Real-time map rendering using **MapTiler** and **LocationIQ**.
  * Precise café pin locations and custom coffee markers.
  * Distance calculations (in miles) and estimated walking/driving travel times from user live coordinates.
  * One-tap turn-by-turn navigation via **Apple Maps** or **Google Maps**.
* **📊 Study Environment Metrics**:
  * Quietness ratings (Loud, Moderate, Quiet).
  * Aesthetics ratings (1 to 5 stars).
  * Live crowd status tracking (Low, Moderate, Busy, Full).
  * Weekly operating hours & open/closed indicators.
* **⭐ Favorites & Rating System**: Bookmark favorite study spots and submit ratings backed by PostgreSQL views and RLS security.

---

## 🛠️ Technology Stack

* **Framework**: [React Native](https://reactnative.dev/) / [Expo (v57)](https://docs.expo.dev/versions/v57.0.0/)
* **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based navigation)
* **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, RLS Policies, Functions)
* **Language**: TypeScript
* **Map Providers**: MapTiler & LocationIQ API

---

## 🚀 Getting Started

### 1. Prerequisites

* [Node.js](https://nodejs.org/) (v18+)
* [npm](https://www.npmjs.com/) or `yarn`
* [Expo Go](https://expo.dev/go) app on iOS/Android or an emulator

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/VinayNekkanti/CafeApp.git
cd CafeApp
npm install
```

### 3. Environment Setup

Create a `.env` file in the project root (see `.env.example`):

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-id.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
EXPO_PUBLIC_MAPTILER_API_KEY=your-maptiler-key
EXPO_PUBLIC_LOCATIONIQ_KEY=your-locationiq-key
```

### 4. Database Setup

Apply the schema migration to your Supabase PostgreSQL database:

1. Open your **Supabase SQL Editor**.
2. Run the SQL script located in [`supabase/migrations/20260809000000_init_schema.sql`](./supabase/migrations/20260809000000_init_schema.sql).

### 5. Running the App

Start the Expo local development server:

```bash
npm run start
```

Press `w` to open in browser, or scan the QR code using Expo Go.

---

## 🔒 Security & Privacy

* **Row Level Security (RLS)**: User profiles in `public.profiles` are strictly private (`auth.uid() = id`).
* **Environment Protection**: `.env` is git-ignored to prevent accidental key exposure.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
