# Team Current Inventory Management Web Application

Full-stack Inventory Management Web Application for "Team Current", a professional lighting solutions and event services company.

## Setup Instructions

### Environment Variables
Create a `.env` file in the root based on `.env.example`:
```
DATABASE_URL=your_neondb_connection_string
JWT_SECRET=your_jwt_secret
AES_SECRET_KEY=your_32_char_aes_key
AES_IV=your_16_char_iv
```

### Local Setup
1. Clone the repository
2. Run `npm install`
3. Run `npm run build` to initialize the database schema and insert default admin seed.
4. Run `npm run dev` to start the local server.

### Default Admin Credentials
- Email: `admin@teamcurrent.com`
- Password: `Admin@TC2024`

### Vercel Deployment
1. Connect this repository to your Vercel account.
2. In Vercel Project Settings > Environment Variables, add the ones listed above.
3. Deploy! Standard Vercel configuration is handled via `vercel.json`.
