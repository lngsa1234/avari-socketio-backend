# Avari Backend - Production Socket.IO Server

**NEW** standalone backend project for Avari - completely separate from Coffee Chat.

Production-ready WebRTC signaling server built with Socket.IO for reliable, real-time video calling.

## 🎯 What This Is

A **brand new**, production-grade backend specifically designed for Avari from the ground up. Not a modification - a complete standalone project.

### Key Features

✅ **Socket.IO** - Industry-standard, battle-tested  
✅ **Automatic Reconnection** - Network resilience built-in  
✅ **Production-Ready** - Error handling, monitoring, graceful shutdown  
✅ **TURN/STUN Support** - Works behind firewalls  
✅ **Clean Architecture** - Well-organized, maintainable code  
✅ **Type-Safe** - Full TypeScript support on frontend  

## 🚀 Quick Start

### 1. Clone/Create Project

```bash
mkdir avari-backend
cd avari-backend

# Copy all files from this package
# Or git clone your-repo
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

Required variables:
```bash
AVARI_FRONTEND_URL=https://your-avari-app.vercel.app
METERED_USERNAME=your_metered_username
METERED_CREDENTIAL=your_metered_credential
```

### 4. Run Locally

```bash
npm run dev
# Server runs on http://localhost:3001
```

### 5. Test

```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","app":"Avari",...}
```

## 📦 Project Structure

```
avari-backend/
├── server.js              # Main server file
├── package.json           # Dependencies
├── .env.example           # Environment template
├── .gitignore            # Git ignore rules
├── public/               # Optional landing page
└── README.md             # This file
```

## 🔌 API Endpoints

### Health Check
```bash
GET /health

Response:
{
  "status": "ok",
  "app": "Avari",
  "version": "1.0.0",
  "stats": {
    "activeMatches": 2,
    "connectedUsers": 4
  }
}
```

### Detailed Stats
```bash
GET /api/stats

Response:
{
  "activeMatches": 2,
  "connectedUsers": 4,
  "matches": [
    {
      "matchId": "match-123",
      "participantCount": 2,
      "participants": [...]
    }
  ]
}
```

### ICE Servers (TURN/STUN)
```bash
GET /api/ice-servers

Response:
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": "turn:a.relay.metered.ca:80",
      "username": "...",
      "credential": "..."
    }
  ]
}
```

## 🔌 Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `register` | `{ userId, matchId }` | Join a match |
| `initiate-call` | `{ to }` | Start call request |
| `accept-call` | `{ to }` | Accept incoming call |
| `reject-call` | `{ to, reason? }` | Decline call |
| `offer` | `{ offer, to }` | WebRTC offer |
| `answer` | `{ answer, to }` | WebRTC answer |
| `ice-candidate` | `{ candidate, to }` | ICE candidate |
| `end-call` | `{ to? }` | End call |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `joined` | `{ matchId, participants }` | Successfully joined |
| `user-joined` | `{ userId }` | Someone joined |
| `user-left` | `{ userId }` | Someone left |
| `incoming-call` | `{ from }` | Receive call |
| `call-accepted` | `{ from }` | Call accepted |
| `call-rejected` | `{ from, reason }` | Call rejected |
| `call-ended` | `{ from }` | Call ended |
| `offer` | `{ offer, from }` | WebRTC offer |
| `answer` | `{ answer, from }` | WebRTC answer |
| `ice-candidate` | `{ candidate, from }` | ICE candidate |
| `error` | `{ type, message }` | Error |

## 💻 Frontend Integration

### Install Dependencies

```bash
npm install socket.io-client
```

### Copy Frontend Files

```bash
# Copy these to your Avari Next.js app:
frontend/hooks/useSignaling.ts     → /your-app/hooks/
frontend/hooks/useIceServers.ts    → /your-app/hooks/
frontend/components/VideoCall.tsx  → /your-app/components/
```

### Configure Environment

```bash
# In your Avari .env.local
NEXT_PUBLIC_SIGNALING_SERVER_URL=https://your-backend.onrender.com
```

### Use in Your App

```typescript
import VideoCall from '@/components/VideoCall';

// In your match page
<VideoCall
  matchId={matchId}
  userId={user.id}
  otherUserId={otherUser.id}
  otherUserName={otherUser.name}
  onEndCall={() => router.push('/dashboard')}
/>
```

## 🌐 Deployment to Render

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial Avari backend"
git remote add origin https://github.com/your-username/avari-backend.git
git push -u origin main
```

### 2. Create Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `avari-backend`
   - **Region**: Choose closest to users
   - **Branch**: `main`
   - **Root Directory**: (leave blank)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` or `Standard ($7/mo)`

### 3. Environment Variables in Render

Add in Render Dashboard → Environment:

```
AVARI_FRONTEND_URL=https://your-avari-app.vercel.app
METERED_USERNAME=your_metered_username
METERED_CREDENTIAL=your_metered_credential
NODE_ENV=production
```

### 4. Deploy

Click **"Create Web Service"** - Render will deploy automatically.

Your backend will be available at:
```
https://avari-backend.onrender.com
```

### 5. Update Frontend

Update your Avari app's `.env`:
```bash
NEXT_PUBLIC_SIGNALING_SERVER_URL=https://avari-backend.onrender.com
```

Deploy frontend to Vercel.

## 🧪 Testing

### Test Endpoints

```bash
# Health
curl https://your-backend.onrender.com/health

# Stats
curl https://your-backend.onrender.com/api/stats

# ICE servers
curl https://your-backend.onrender.com/api/ice-servers
```

### Test Socket.IO Connection

```javascript
// In browser console
const socket = io('https://your-backend.onrender.com');

socket.on('connect', () => {
  console.log('Connected!');
  
  socket.emit('register', {
    userId: 'test-user',
    matchId: 'test-match'
  });
});

socket.on('joined', (data) => {
  console.log('Joined:', data);
});
```

## 📊 Monitoring

### Check Active Matches

```bash
curl https://your-backend.onrender.com/api/stats | jq
```

### Server Logs

View in Render Dashboard → Your Service → Logs

Look for:
```
[Avari] New connection: abc123
[Avari] User user-1 joined match match-1
[Avari] Call initiated: user-1 -> user-2
[Avari] Call accepted: user-2 -> user-1
```

## 🔒 Security Features

- ✅ CORS configured for your frontend only
- ✅ Connection timeouts prevent hanging connections
- ✅ Graceful shutdown on server restart
- ✅ Error boundaries prevent crashes
- ✅ User validation before match join
- ✅ Match size limits (2 people max)

## 🎯 Production Checklist

Before going live:

- [ ] Environment variables set in Render
- [ ] TURN server credentials configured
- [ ] Frontend URL correct in CORS
- [ ] Test endpoints working
- [ ] Socket.IO connecting successfully
- [ ] Video calls working end-to-end
- [ ] Test on mobile devices
- [ ] Monitor server logs
- [ ] Set up error alerts

## 💰 Cost

### Render Pricing

- **Free Tier**: $0/month
  - 750 hours/month
  - Cold starts (30-60s delay)
  - Good for testing

- **Standard Tier**: $7/month
  - Always-on (no cold starts)
  - Better performance
  - **Recommended for production**

### TURN Server

- **Metered.ca**: 50GB free/month
- Then $0.50/GB
- Typical usage: 1-2GB per 100 hours of calls
- **~$5-10/month** for moderate usage

### Total

- **Development**: $0/month
- **Production**: $7-17/month

## 🔧 Advanced Configuration

### Custom TURN Server

If you have your own TURN server:

```bash
# .env
TURN_SERVER_URL=turn:your-server.com:3478
TURN_USERNAME=your_username
TURN_CREDENTIAL=your_password
```

### Logging Level

```bash
LOG_LEVEL=debug  # or 'info', 'warn', 'error'
```

### Connection Limits

```bash
MAX_CONNECTIONS_PER_IP=10
```

## 🐛 Troubleshooting

### Can't Connect to Server

**Check:**
1. Server running? (visit `/health`)
2. CORS configured correctly?
3. Frontend URL matches environment variable?

**Fix:**
```bash
# Verify CORS in server logs
[Avari] Frontend: https://your-correct-url.vercel.app
```

### Socket.IO Not Connecting

**Check:**
1. `NEXT_PUBLIC_SIGNALING_SERVER_URL` set?
2. Browser console errors?
3. Server logs show connection attempts?

**Debug:**
```typescript
// In frontend
const socket = io(serverUrl, {
  transports: ['websocket', 'polling'],
  debug: true  // Enable debug logs
});
```

### Video Calls Not Working

**Check:**
1. Both users in same match?
2. ICE servers loading? (check `/api/ice-servers`)
3. Browser permissions granted?
4. TURN server working?

**Test TURN:**
```bash
curl https://your-backend.onrender.com/api/ice-servers
# Should show TURN servers with credentials
```

### Cold Starts (Free Tier)

**Symptom**: First request takes 30-60 seconds

**Options:**
1. Upgrade to Standard tier ($7/month)
2. Accept delay (fine for development)
3. Keep server warm with cron ping

## 🚀 Scaling

### Current Capacity

- Free tier: ~50-100 concurrent connections
- Standard tier: ~500-1000 concurrent connections

### To Scale Further

1. **Enable Redis** for distributed sessions
2. **Horizontal scaling** with Socket.IO adapter
3. **Load balancer** across multiple instances

## 📚 Documentation

- [Socket.IO Docs](https://socket.io/docs/)
- [WebRTC Guide](https://webrtc.org/)
- [Render Docs](https://render.com/docs)

## 🆘 Support

Issues? Check:
1. Server logs in Render dashboard
2. Browser console for frontend errors
3. Network tab for failed requests
4. `/health` and `/api/stats` endpoints

---

**Ready to deploy?** Follow the deployment guide and you'll be live in 10 minutes! 🚀
