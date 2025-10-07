const puppeteer = require("puppeteer");
const fs = require("fs");

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // ✅ Force desktop version of Facebook
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  // ✅ Load cookies
  const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf8"));
  await page.setCookie(...cookies);

  // ✅ Your Facebook Post URL (added)
  const postUrl = "https://www.facebook.com/share/p/1CW3v3vPeW/";
  await page.goto(postUrl, { waitUntil: "networkidle2" });

  // Screenshot to verify login/post load
  await page.screenshot({ path: "post-opened.png" });
  console.log("📸 Screenshot saved: post-opened.png");

  // Read comments
  const comments = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
  const names = fs.existsSync("names.txt")
    ? fs.readFileSync("names.txt", "utf8").split("\n").filter(Boolean)
    : [];

  const delayInMs = 10000; // ⏳ 5 second delay
  let cycle = 1;

  while (true) {
    console.log(`🔁 Starting comment cycle ${cycle}...`);
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i].trim();
      const name = names.length > 0 ? names[i % names.length].trim() : "";
      const finalComment = name ? `${name} ${comment}` : comment;

      try {
        await page.waitForSelector('div[contenteditable="true"]', { timeout: 15000 });
        await page.evaluate(() => {
          document.querySelector('div[contenteditable="true"]').scrollIntoView();
        });
        await page.type('div[contenteditable="true"]', finalComment);
        await page.keyboard.press("Enter");
        console.log("✅ Commented:", finalComment);
        await delay(delayInMs);
      } catch (err) {
        console.error("❌ Failed to comment:", finalComment, err.message);
      }
    }
    cycle++;
  }

  // Never closes due to infinite loop
})();
