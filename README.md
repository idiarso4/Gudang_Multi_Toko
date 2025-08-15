# Marketplace Integration App

Aplikasi integrasi marketplace untuk mengelola multi-toko online di berbagai platform seperti Shopee, Tokopedia, Lazada, Blibli, Bukalapak, JD.ID, TikTok Shop, WooCommerce, dan Shopify.

## 🚀 Fitur Utama

- **Multi-Marketplace Integration** - Integrasi dengan 9+ marketplace besar
- **Inventory Management** - Sinkronisasi stok otomatis antar marketplace
- **Order Management** - Manajemen pesanan terpadu dari semua channel
- **Product Management** - Upload produk ke multiple marketplace sekaligus
- **Analytics & Reporting** - Laporan penjualan dan keuangan real-time
- **Dashboard** - Monitoring semua aktivitas toko dalam satu tempat

## 🛠️ Teknologi Stack

### Backend
- **Node.js + Express.js** - REST API server
- **PostgreSQL** - Database utama
- **Prisma** - ORM dan database management
- **Redis** - Caching dan queue management
- **Bull Queue** - Background job processing
- **Socket.io** - Real-time updates

### Frontend
- **React.js + TypeScript** - Web application
- **Vite** - Build tool dan development server
- **Tailwind CSS** - Styling framework
- **React Query** - Data fetching dan state management
- **Chart.js** - Data visualization

### Integration
- **Axios** - HTTP client untuk marketplace APIs
- **Node-cron** - Scheduled tasks
- **Winston** - Logging

## 📁 Struktur Project

```
marketplace-integration/
├── server/                 # Backend application
│   ├── src/
│   │   ├── controllers/    # Route controllers
│   │   ├── models/         # Database models
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── integrations/   # Marketplace integrations
│   │   ├── jobs/           # Background jobs
│   │   └── utils/          # Utility functions
│   ├── prisma/             # Database schema dan migrations
│   └── index.js            # Server entry point
├── client/                 # Frontend application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API services
│   │   ├── utils/          # Utility functions
│   │   └── types/          # TypeScript types
│   └── package.json
└── package.json            # Root package.json
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Installation

1. Clone repository
```bash
git clone <repository-url>
cd marketplace-integration
```

2. Install dependencies
```bash
npm run install:all
```

3. Setup environment variables
```bash
cp server/.env.example server/.env
# Edit server/.env dengan konfigurasi database dan API keys
```

4. Setup database
```bash
npm run db:migrate
npm run db:generate
```

5. Start development server
```bash
npm run dev
```

Aplikasi akan berjalan di:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Database Studio: http://localhost:5555 (jalankan `npm run db:studio`)

## 📚 API Documentation

API documentation tersedia di `/api/docs` setelah server berjalan.

## 🔧 Configuration

### Environment Variables

Buat file `.env` di folder `server/` dengan konfigurasi berikut:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/marketplace_integration"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"

# Marketplace API Keys
SHOPEE_API_KEY="your-shopee-api-key"
SHOPEE_API_SECRET="your-shopee-api-secret"

TOKOPEDIA_API_KEY="your-tokopedia-api-key"
TOKOPEDIA_API_SECRET="your-tokopedia-api-secret"

# ... (API keys untuk marketplace lainnya)
```

## 🤝 Contributing

1. Fork repository
2. Buat feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push ke branch (`git push origin feature/amazing-feature`)
5. Buat Pull Request

## 📄 License

Project ini menggunakan MIT License. Lihat file `LICENSE` untuk detail.
