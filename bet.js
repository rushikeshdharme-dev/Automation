const axios = require("axios");
const CryptoJS = require("crypto-js");

// ================= CONFIGURATION =================
const BASE_URL = "https://api.ar-lottery01.com";
const DRAW_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";
const FRONTEND_ORIGIN = "https://bdgwinclubs.in";

// Yahan apna bilkul fresh token dalein
const BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJUb2tlblR5cGUiOiJBY2Nlc3NfVG9rZW4iLCJUZW5hbnRJZCI6IjEwMTUiLCJVc2VySWQiOiIxMDE1MDAxMTY4NDYzNCIsIkFnZW50Q29kZSI6IjEwMTUwMSIsIlRlbmFudEFjY291bnQiOiIxMTY4NDYzNCIsIkxvZ2luSVAiOiIxMDMuNzAuMjAwLjE1NiIsIkxvZ2luVGltZSI6IjE3OTM3NDc5MzQ5NTIiLCJTeXNDdXJyZW5jeSI6IklOUiIsIlN5c0xhbmd1YWdlIjoiZW4iLCJEZXZpY2VUeXBlIjoiUEMiLCJMb3R0ZXJ5TGltaXRHcm91cE51bSI6IjAiLCJVc2VyVHlwZSI6IjAiLCJuYmYiOjE3OTM3NDc5NzAsImV4cCI6MTc5Mzc1MTU3MCwiaXNzIjoiand0SXNzdWVyIiwiYXVkIjoibG90dGVyeVRpY2tldCJ9.jnVSaIvFmjVSfsaQZMHLdqoA_m2uf3Nlq1nEP1bGob0";

const GAME_CODE = "WinGo_30S";
const BASE_BET_AMOUNT = 2;  // Starting amount (₹1)
let currentMultiple = 1;

// ================= HELPER FUNCTIONS =================

function generateRandom12() {
  return Math.floor(100000000000 + Math.random() * 900000000000);
}

function generateSignedPayload(rawPayload) {
  const filteredKeys = Object.keys(rawPayload)
    .filter(
      (key) =>
        key !== "signature" &&
        key !== "timestamp" &&
        rawPayload[key] !== null &&
        rawPayload[key] !== undefined &&
        rawPayload[key] !== ""
    )
    .sort();

  const sortedObj = {};
  for (const key of filteredKeys) {
    sortedObj[key] = rawPayload[key];
  }

  const jsonString = JSON.stringify(sortedObj);
  const signature = CryptoJS.MD5(jsonString).toString(CryptoJS.enc.Hex).toUpperCase();
  const timestamp = Math.floor(Date.now() / 1000);

  return {
    ...sortedObj,
    signature,
    timestamp,
  };
}

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    "Origin": FRONTEND_ORIGIN,
    "Referer": `${FRONTEND_ORIGIN}/`,
    "Authorization": BEARER_TOKEN.startsWith("Bearer ") ? BEARER_TOKEN : `Bearer ${BEARER_TOKEN}`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  timeout: 5000,
});

// ================= API FUNCTIONS =================

async function getLatestHistoryAndNextIssue() {
  try {
    const ts = Date.now();
    const response = await axios.get(`${DRAW_URL}?ts=${ts}`, {
      headers: {
        "Origin": FRONTEND_ORIGIN,
        "Referer": `${FRONTEND_ORIGIN}/`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"
      }
    });

    if (response.data && response.data.code === 0 && response.data.data) {
      const list = response.data.data.list;
      if (list && list.length > 0) {
        const latestRound = list[0]; 
        const nextIssueNumber = String(BigInt(latestRound.issueNumber) + 1n);

        return {
          lastIssue: latestRound.issueNumber,
          lastNumber: parseInt(latestRound.number),
          lastColor: latestRound.color,
          nextIssue: nextIssueNumber
        };
      }
    }
    return null;
  } catch (err) {
    console.error("[History Fetch Error]:", err.message);
    return null;
  }
}

async function getBalance() {
  try {
    const params = generateSignedPayload({
      language: "en",
      random: generateRandom12(),
    });
    const response = await apiClient.get("/api/Lottery/GetBalance", { params });
    if (response.data && response.data.code === 0) {
      console.log(`[Account Balance]: ₹${response.data.data.amount}`);
    } else {
      console.log("[Balance Response Error]:", response.data);
    }
  } catch (err) {
    const status = err.response ? err.response.status : "Unknown Status";
    const data = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[GetBalance Exception] Status: ${status} | Details: ${data}`);
  }
}

function predictNextBet(lastNumber) {
  return lastNumber <= 4 ? "BigSmall_Big" : "BigSmall_Small";
}

async function placeBet(issueNumber, betContent) {
  try {
    const rawPayload = {
      gameCode: GAME_CODE,
      issueNumber: String(issueNumber),
      amount: BASE_BET_AMOUNT,
      betMultiple: currentMultiple,
      betContent: betContent,
      language: "en",
      random: generateRandom12(),
    };

    const signedPayload = generateSignedPayload(rawPayload);
    console.log(`[Placing Bet] Issue: ${issueNumber} | Pick: ${betContent} | Multiplier: ${currentMultiple}x`);

    const response = await apiClient.post("/api/Lottery/WinGoBet", signedPayload);
    console.log("[Bet Response]:", response.data);
    return response.data;
  } catch (err) {
    const status = err.response ? err.response.status : "Unknown Status";
    const data = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[PlaceBet Exception] Status: ${status} | Details: ${data}`);
    return null;
  }
}

// ================= AUTOMATION LOOP =================

let lastProcessedIssue = null;

async function startAutoBetting() {
  console.log(`=== WinGo 30S Fast Bot Started for ${FRONTEND_ORIGIN} ===`);
  await getBalance();

  // Har 1 second (1000ms) par check karega taaki delay khatam ho jaye
  setInterval(async () => {
    const historyInfo = await getLatestHistoryAndNextIssue();
    if (!historyInfo) return;

    const targetIssue = historyInfo.nextIssue;

    if (targetIssue !== lastProcessedIssue) {
      const currentSeconds = new Date().getSeconds() % 30;

      // Safe window: 2nd second se 22nd second ke beech
      if (currentSeconds >= 2 && currentSeconds <= 22) {
        console.log(`\n----------------------------------------`);
        console.log(`[Round Info] Last Finished: ${historyInfo.lastIssue} | Number: ${historyInfo.lastNumber} (${historyInfo.lastColor})`);
        console.log(`[Action] Targeting Next Issue: ${targetIssue}`);

        const prediction = predictNextBet(historyInfo.lastNumber);
        
        lastProcessedIssue = targetIssue;

        const betRes = await placeBet(targetIssue, prediction);

        if (betRes && betRes.code === 0) {
          await getBalance();
        } else {
          console.log("[Notice] Bet rejected or failed. Moving to next round...");
        }
      }
    }
  }, 1000); // Polling frequency increased to 1 second
}

startAutoBetting();
