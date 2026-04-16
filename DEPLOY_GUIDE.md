# 📈 Growth Stock Scanner — Cloud Deployment Guide

## วิธี deploy ให้เข้าได้จากทุกเครื่อง ทุก Device

---

## Option A: Railway.app (แนะนำ — ฟรี ง่ายที่สุด)

ได้ URL แบบนี้: `https://your-app-name.railway.app`

### Step 1: สร้าง GitHub Account (ฟรี)
1. ไปที่ **github.com** → Sign up
2. ยืนยัน email

### Step 2: Upload code ขึ้น GitHub
1. ไปที่ **github.com/new** → ตั้งชื่อ repo เช่น `growth-scanner`
2. เลือก **Private** → กด Create repository
3. กด **"uploading an existing file"**
4. ลากไฟล์ทั้งหมดจากโฟลเดอร์ GrowthStockCloud ใส่
   (app.py, requirements.txt, Procfile, runtime.txt, templates/, static/)
5. กด **Commit changes**

### Step 3: Deploy บน Railway
1. ไปที่ **railway.app** → Sign in with GitHub
2. กด **"New Project"** → **"Deploy from GitHub repo"**
3. เลือก repo ที่สร้างไว้
4. Railway จะ detect Python และ build อัตโนมัติ (~2 นาที)
5. กด **"Generate Domain"** → ได้ URL ใช้งานได้เลย!

**ค่าใช้จ่าย Railway:**
- Free tier: $5 credit/เดือน (เพียงพอสำหรับ app ขนาดนี้)
- ไม่ต้องใส่ credit card

---

## Option B: Render.com (ฟรีแบบ sleep)

App จะ sleep ถ้าไม่มีคนใช้งาน 15 นาที แต่ฟรีสมบูรณ์

1. ไปที่ **render.com** → Sign up
2. กด **New** → **Web Service**
3. Connect GitHub repo
4. ตั้งค่า:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 120`
5. Deploy → ได้ URL เช่น `https://growth-scanner.onrender.com`

---

## Option C: ใช้ภายใน Local Network (บ้าน/ออฟฟิส)

ถ้าอยากให้คนในบ้านหรือออฟฟิสเข้าได้ โดยไม่ต้อง cloud:

### บน Windows (START_LOCAL.bat)
1. ดับเบิ้ลคลิก **START_LOCAL.bat**
2. App รันที่ `http://0.0.0.0:5000`
3. เปิด Command Prompt พิมพ์ `ipconfig`
4. หา **IPv4 Address** เช่น `192.168.1.5`
5. คนอื่นในบ้านเปิดเบราว์เซอร์ที่ `http://192.168.1.5:5000`

**ข้อจำกัด:** ต้องเปิดคอมไว้ตลอด, ใช้ได้เฉพาะ WiFi เดียวกัน

---

## Option D: ngrok (Tunnel ชั่วคราว — ฟรี)

ได้ URL ชั่วคราวที่เข้าได้จากทุกที่ เหมาะสำหรับทดสอบ

1. ดาวน์โหลด ngrok ที่ **ngrok.com/download**
2. รัน app ปกติ (`START.bat`)
3. เปิด Command Prompt ใหม่:
   ```
   ngrok http 5000
   ```
4. ได้ URL เช่น `https://abc123.ngrok.io`
5. URL นี้ใช้ได้ตราบที่ ngrok ยังรันอยู่

---

## ไฟล์ที่จำเป็นสำหรับ Cloud Deploy

```
GrowthStockCloud/
├── app.py              ← Server หลัก
├── requirements.txt    ← Packages (มี gunicorn เพิ่ม)
├── Procfile            ← บอก Railway/Render วิธีรัน
├── runtime.txt         ← บอก Python version
├── .gitignore          ← ไม่ upload ไฟล์ขยะ
├── templates/
│   └── index.html      ← หน้าเว็บ (responsive mobile+desktop)
└── static/
    ├── css/style.css
    └── js/app.js
```

---

## Mobile UI Features

เมื่อเปิดบน mobile (< 900px):
- **Card layout** แทน table (อ่านง่ายบนมือถือ)
- **Top 3 stocks** ไฮไลต์ด้วยเส้นสีทอง
- แต่ละ card แสดง: Ticker, Score, Sector, Rev Growth, P/E, ROE
- **Tap card** → เปิด detail drawer เต็มหน้าจอ
- Filter bar ปรับเป็น 2 คอลัมน์
- ปุ่มทุกปุ่ม touch-friendly (min 44px)

---

## วิธีรันแบบ Local (Windows)

ดับเบิ้ลคลิก **START.bat** เหมือนเดิม
แต่ถ้าจะให้คนในบ้านเข้าได้ด้วย ใช้ **START_LOCAL.bat**

---

*ไม่ใช่คำแนะนำการลงทุน | Not financial advice*
