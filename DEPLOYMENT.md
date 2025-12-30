# Avari Backend Deployment Guide

Complete step-by-step guide to deploy your new Socket.IO backend.

## 🎯 Overview

This guide covers deploying a **brand new** Avari backend project to Render, completely separate from any existing servers.

**Time required:** 15-20 minutes  
**Cost:** $0-7/month  
**Difficulty:** Easy

## 📋 Prerequisites

Before starting, have ready:
- [ ] GitHub account
- [ ] Render account (free)
- [ ] Metered.ca TURN credentials (free, get at metered.ca)
- [ ] Your Avari frontend URL (Vercel)

## 🚀 Part 1: Deploy Backend (10 minutes)

### Step 1: Create GitHub Repository

```bash
# On your computer
mkdir avari-backend
cd avari-backend

# Copy all files from this package into the directory

# Initialize git
git init
git add .
git commit -m "Initial Avari backend with Socket.IO"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/avari-backend.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Render

1. Go to https://dashboard.render.com/
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect GitHub"** (if not already connected)
4. Select your `avari-backend` repository
5. Configure:

```
Name: avari-backend
Region: Oregon (US West) or closest to your users
Branch: main
Root Directory: (leave blank)
Runtime: Node
Build Command: npm install
Start Command: npm start
Instance Type: Free (or Standard for $7/mo - recommended for production)
```

6. Click **"Advanced"** to add environment variables:

```
AVARI_FRONTEND_URL = https://your-avari-app.vercel.app
METERED_USERNAME = your_metered_username_here
METERED_CREDENTIAL = your_metered_credential_here
NODE_ENV = production
```

7. Click **"Create Web Service"**

### Step 3: Wait for Deployment

Render will:
1. Build your app (~2 minutes)
2. Start the server (~30 seconds)
3. Make it live

You'll see: `https://avari-backend.onrender.com` (or similar)

### Step 4: Verify Backend is Running

```bash
# Test health endpoint
curl https://avari-backend.onrender.com/health

# Should return:
{
  "status": "ok",
  "app": "Avari",
  "version": "1.0.0",
  ...
}

# Test TURN credentials
curl https://avari-backend.onrender.com/api/ice-servers

# Should show STUN and TURN servers
```

✅ Backend deployed!

## 💻 Part 2: Update Frontend (5 minutes)

### Step 1: Install Socket.IO Client

```bash
cd /your-avari-frontend
npm install socket.io-client
```

### Step 2: Copy Frontend Files

Copy these files from the backend package:

```bash
# Copy hooks
cp frontend/hooks/useSignaling.ts src/hooks/
cp frontend/hooks/useIceServers.ts src/hooks/

# Copy component (or merge with your existing VideoCall)
cp frontend/components/VideoCall.tsx src/components/
```

### Step 3: Update Environment Variable

Create or update `.env.local`:

```bash
NEXT_PUBLIC_SIGNALING_SERVER_URL=https://avari-backend.onrender.com
```

**Important:** Use your actual Render URL from Step 3 above!

### Step 4: Test Locally

```bash
npm run dev
# Open http://localhost:3000
# Try to start a video call
# Check browser console for "[Avari] Connected"
```

### Step 5: Deploy to Vercel

```bash
git add .
git commit -m "Integrate Socket.IO backend"
git push origin main

# If connected to Vercel, it auto-deploys
# Or manually deploy via Vercel dashboard
```

In Vercel Dashboard:
1. Go to your project → Settings → Environment Variables
2. Add:
   ```
   NEXT_PUBLIC_SIGNALING_SERVER_URL = https://avari-backend.onrender.com
   ```
3. Redeploy if needed

✅ Frontend deployed!

## 🧪 Part 3: End-to-End Testing (5 minutes)

### Test 1: Server Health

```bash
curl https://avari-backend.onrender.com/health
# Should return: status: "ok"
```

### Test 2: Frontend Connection

1. Open your Avari app: `https://your-app.vercel.app`
2. Open browser console (F12)
3. Navigate to a match
4. Look for: `[Avari] Connected to signaling server`

### Test 3: Video Call

**Two devices/browsers required:**

1. **Device 1**: Login as User A, go to a match
2. **Device 2**: Login as User B, go to same match
3. **Device 1**: Click "Start Call"
4. **Device 2**: Should see "Incoming Call"
5. **Device 2**: Click "Accept"
6. **Both**: Should see each other's video

If it works: ✅ **You're live!**

## 🔍 Troubleshooting

### Issue: "Cannot connect to server"

**Check:**
```bash
# 1. Is backend running?
curl https://avari-backend.onrender.com/health

# 2. Is frontend URL correct?
echo $NEXT_PUBLIC_SIGNALING_SERVER_URL

# 3. Check browser console
# Should see: [Avari] Connecting to: https://...
```

**Fix:**
- Verify `NEXT_PUBLIC_SIGNALING_SERVER_URL` matches your Render URL
- Check Render logs for errors
- Ensure CORS is configured (should be automatic)

### Issue: "Connection refused" or CORS error

**Cause:** Frontend URL not matching CORS config

**Fix:**
1. Go to Render Dashboard → avari-backend → Environment
2. Verify `AVARI_FRONTEND_URL` matches your Vercel URL exactly
3. No trailing slash: `https://app.vercel.app` (not `https://app.vercel.app/`)
4. Redeploy in Render (Manual Deploy button)

### Issue: Video call connects but no video

**Check:**
```bash
# Are TURN servers configured?
curl https://avari-backend.onrender.com/api/ice-servers
# Should show multiple servers including TURN
```

**Fix:**
- Verify `METERED_USERNAME` and `METERED_CREDENTIAL` in Render
- Get new credentials at https://www.metered.ca/
- Check browser console for ICE connection errors

### Issue: "Cold start" - first request slow

**Symptom:** First video call after 15+ min of inactivity takes 30-60 seconds

**Cause:** Render free tier spins down after 15 minutes

**Options:**
1. **Accept it** (fine for development)
2. **Upgrade to Standard** ($7/month - no cold starts)
3. **Keep-alive ping** (workaround - ping server every 10 min)

### Issue: Works locally but not in production

**Check:**
1. Environment variables set in Vercel?
2. Environment variables set in Render?
3. URLs use `https://` not `http://`?
4. Both deployments completed successfully?

**Debug:**
```javascript
// Add to your frontend
console.log('Server URL:', process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL);
// Should show your Render URL
```

## 📊 Monitoring

### Check Server Health

**Render Dashboard:**
- Metrics tab: CPU, Memory, Response time
- Logs tab: Real-time logs
- Events tab: Deployment history

**Quick check:**
```bash
# How many active calls?
curl https://avari-backend.onrender.com/api/stats | jq

# Output shows:
{
  "activeMatches": 2,
  "connectedUsers": 4,
  ...
}
```

### Set Up Alerts (Optional)

Render Dashboard → avari-backend → Notifications:
- ✅ Failed builds
- ✅ Service down
- ✅ High memory usage

## 🎯 Production Checklist

Before announcing launch:

**Backend:**
- [ ] Deployed to Render
- [ ] Environment variables set
- [ ] TURN server configured
- [ ] `/health` returns OK
- [ ] `/api/stats` accessible
- [ ] Logs look clean

**Frontend:**
- [ ] Deployed to Vercel
- [ ] `NEXT_PUBLIC_SIGNALING_SERVER_URL` set
- [ ] Socket.IO client installed
- [ ] Browser console shows "[Avari] Connected"
- [ ] No CORS errors

**Testing:**
- [ ] Can create video call
- [ ] Can accept video call
- [ ] Video/audio works
- [ ] Call controls work (mute, video toggle, end)
- [ ] Tested on mobile
- [ ] Tested on different browsers
- [ ] Works behind corporate firewall (if applicable)

**Optional but Recommended:**
- [ ] Upgrade Render to Standard ($7/mo)
- [ ] Set up monitoring alerts
- [ ] Document for team

## 💰 Cost Breakdown

### Development/Testing
- Render Free: **$0/month**
- Metered.ca Free: **$0/month** (50GB)
- Vercel Free: **$0/month**
- **Total: $0/month**

### Production (Recommended)
- Render Standard: **$7/month**
- Metered.ca: **~$2-5/month** (typical usage)
- Vercel Pro: **$20/month** (optional)
- **Total: $9-32/month**

### At Scale (1000s of users)
- Render Standard: **$7/month**
- Metered.ca: **~$20/month**
- Vercel Pro: **$20/month**
- **Total: ~$47/month**

Still way cheaper than Daily.co ($50-500/mo)!

## 🚀 Next Steps

Now that you're deployed:

1. **Test thoroughly** - Try from different networks/devices
2. **Monitor logs** - Watch for errors in first few days
3. **Gather feedback** - Have beta users try it
4. **Optimize** - Add features like screen sharing
5. **Scale** - Upgrade tier as needed

## 📚 Resources

- Backend README: Complete API documentation
- Socket.IO Docs: https://socket.io/docs/
- Render Docs: https://render.com/docs
- Metered.ca: https://www.metered.ca/

## 🎉 Success!

If you completed all steps and tests pass, you now have:

✅ Production-ready Socket.IO backend on Render  
✅ Frontend integrated and deployed on Vercel  
✅ TURN servers for reliable connections  
✅ Real-time video calling working  
✅ Automatic reconnection  
✅ Proper error handling  

**You're ready to launch Avari!** 🚀

---

**Questions?** Check server logs in Render and browser console for errors.
