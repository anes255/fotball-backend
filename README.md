# Prediction World Backend

Complete MVC Backend API for Sports Predictions Platform

## 📁 Project Structure

```
backend/
├── config/
│   ├── database.js      # PostgreSQL connection
│   └── init.js          # Database initialization
├── middleware/
│   └── auth.js          # JWT authentication
├── models/
│   ├── User.js          # User model
│   ├── Team.js          # Team model
│   ├── Match.js         # Match model
│   ├── Prediction.js    # Prediction model
│   ├── ScoringRule.js   # Scoring rules model
│   └── Setting.js       # Settings model
├── controllers/
│   ├── authController.js       # Auth logic
│   ├── teamController.js       # Teams logic
│   ├── matchController.js      # Matches logic
│   ├── predictionController.js # Predictions logic
│   └── adminController.js      # Admin logic
├── routes/
│   ├── authRoutes.js       # /api/auth/*
│   ├── teamRoutes.js       # /api/teams/*
│   ├── matchRoutes.js      # /api/matches/*
│   ├── predictionRoutes.js # /api/predictions/*
│   └── adminRoutes.js      # /api/admin/*
├── server.js            # Main entry point
├── package.json
├── .env
└── .gitignore
```

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or start production server
npm start
```

### Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
JWT_SECRET=your_secret_key
ADMIN_PHONE=0665448641
ADMIN_PASSWORD=your_admin_password
PORT=3000
```

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/verify` | Verify JWT token |
| GET | `/api/auth/profile` | Get user profile |

### Teams
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/teams` | Get all teams |
| GET | `/api/teams/:id` | Get team by ID |
| POST | `/api/teams` | Create team (admin) |
| PUT | `/api/teams/:id` | Update team (admin) |
| DELETE | `/api/teams/:id` | Delete team (admin) |

### Matches
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/matches` | Get all matches |
| GET | `/api/matches/:id` | Get match by ID |
| POST | `/api/matches` | Create match (admin) |
| PUT | `/api/matches/:id` | Update match (admin) |
| PUT | `/api/matches/:id/result` | Set result (admin) |
| DELETE | `/api/matches/:id` | Delete match (admin) |

### Predictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/predictions` | Get user's predictions |
| POST | `/api/predictions` | Make prediction |

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leaderboard` | Get leaderboard |
| GET | `/api/scoring-rules` | Get scoring rules |
| GET | `/api/settings` | Get settings |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | Get all users |
| PUT | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/leaderboard` | Get full leaderboard |
| PUT | `/api/admin/scoring-rules` | Update scoring rules |
| PUT | `/api/admin/settings` | Update settings |
| POST | `/api/admin/award-tournament-winner` | Award bonus points |

## 🔐 Authentication

All protected routes require a Bearer token:

```
Authorization: Bearer <jwt_token>
```

## 📦 Deployment on Render

1. Push code to GitHub
2. Create new **Web Service** on Render
3. Connect GitHub repository
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add environment variables in Render dashboard
6. Deploy!

## 🔧 Database

The application uses PostgreSQL (Neon recommended). 

Tables are automatically created on first run:
- `users` - User accounts
- `teams` - Football teams
- `matches` - Match schedule
- `predictions` - User predictions
- `scoring_rules` - Point system
- `settings` - App settings

## 👤 Default Admin

On first run, a default admin is created:
- **Phone:** (from ADMIN_PHONE env var)
- **Password:** (from ADMIN_PASSWORD env var)

## 📝 License

ISC
