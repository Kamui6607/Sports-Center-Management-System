# Sports Center Management System - Backend

Welcome to the **Sports Center Management System** backend repository. This backend provides a robust REST API for managing users, memberships, class scheduling, and payments for a multi-platform sports center application (Web & Mobile).

## 🚀 Technologies

This project is built using modern Node.js tools and practices:
- **Runtime:** Node.js
- **Framework:** Express.js (v5)
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Validation:** Zod
- **Authentication:** JWT (JSON Web Tokens) with Access & Refresh tokens
- **API Documentation:** Swagger UI
- **Tooling:** `tsx` for local execution, `helmet` & `cors` for security.

## 📦 Project Structure

```
.
├── prisma/               # Prisma schema and migrations
├── src/
│   ├── config/           # App configuration (Swagger, DB connections, etc.)
│   ├── middlewares/      # Express middlewares (Auth, Error Handler, Zod Validation)
│   ├── modules/          # Feature modules (Controllers, Routes, Services, Schemas)
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Helper utilities (Bcrypt, JWT, Pagination, Response)
│   ├── app.ts            # Express app setup
│   └── server.ts         # Server entry point
```

### Core Modules (`src/modules/`)
- **`auth/`**: Registration, Login, Token Management, Password changes.
- **`users/` & `members/` & `coaches/`**: User lifecycle and role-specific profiles.
- **`membership-plans/` & `subscriptions/`**: Subscription tiers (FREE, MEMBERSHIP, PREMIUM) and plan management.
- **`sports/` & `rooms/` & `classes/` & `class-schedules/`**: Core catalog and timetabling.
- **`enrollments/`**: Complex booking logic including capacity, tier, and time-conflict checks.
- **`payments/` & `invoices/`**: Payment tracking and automated invoice generation.
- **`reports/`**: Aggregation APIs for analytics (Revenue, Enrollments, Subscriptions).

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database

### Installation

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file in the root directory and add the following variables (adjust according to your setup):
   ```env
   PORT=3000
   DATABASE_URL="postgresql://user:password@localhost:5432/sport_center?schema=public"
   JWT_ACCESS_SECRET="your_access_secret"
   JWT_REFRESH_SECRET="your_refresh_secret"
   ```

3. **Database Setup:**
   Run Prisma migrations to set up your PostgreSQL database schema:
   ```bash
   npm run db:migrate
   ```
   *(Optional)* Seed the database with initial data:
   ```bash
   npm run db:seed
   ```

### Running the Application

- **Development Mode:**
  ```bash
  npm run dev
  ```
  The server will start with hot-reloading using `tsx`.

- **Production Build:**
  ```bash
  npm run build
  npm start
  ```

## 📚 API Documentation

Once the server is running, you can view the interactive Swagger API documentation by navigating to:
👉 `http://localhost:<PORT>/api/v1/docs`

## 🗄️ Useful Prisma Scripts

- `npm run db:migrate` - Apply migrations to the database.
- `npm run db:generate` - Generate Prisma Client.
- `npm run db:studio` - Open Prisma Studio to view and edit data visually via browser.
- `npm run db:reset` - Reset the database and re-apply all migrations.

## 🤝 Project Flows (Implemented)
- **Flow 1: User & Membership Management:** Fully functional with tier-based validations.
- **Flow 2: Class Booking & Schedule:** Built with robust logic for conflict handling and capacity limits.
- **Flow 3: Payment & Reports:** End-to-end payment lifecycle and dashboard analytics.

*(Note: AI Workouts, AI Assistant, and advanced Attendance features are planned for future phases).*
