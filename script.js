const puppeteer = require("puppeteer");
const fs = require("fs");

// Delay helper (all Puppeteer versions)
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Safe set text
async function setElementText(page, selector, text) {
  try {
    await page.focus(selector);
    await page.keyboard.type(text, { delay: 30 });
    return true;
  } catch (err) {
    return await page.evaluate((sel, txt) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      if (el.isContentEditable) {
        el.innerText = txt;
        el.focus();
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        return true;
      } else if ("value" in el) {
        el.value = txt;
        el.focus();
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
      return false;
    }, selector, text);
  }
}

// Find visible element from list of selectors
async function findVisibleElement(page, selectors, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (!el) continue;
        const box = await el.boundingBox();
        if (box && box.width > 0 && box.height > 0) return sel;
      } catch (e) {}
    }
    await delay(500);
  }
  return null;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  if (!fs.existsSync("cookies.json")) {
    console.error("cookies.json missing! Add your Facebook cookies first.");
    await browser.close();
    return;
  }
  const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf8"));
  await page.setCookie(...cookies);

  const postUrl =
    "https://www.facebook.com/61550558518720/posts/pfbid03kYYF6RN2FEBNW8TVRpFDgsHKuRWakijmFdVcraY1v6yPpPN4vPPegJN9YXCHDdml/?app=fbl";
  await page.goto(postUrl, { waitUntil: "networkidle2" });

  await page.screenshot({ path: "post-opened.png" });
  console.log("📸 Screenshot saved: post-opened.png");

  if (!fs.existsSync("file.txt")) {
    console.error("file.txt missing! Create it with one comment per line.");
    await browser.close();
    return;
  }

  const comments = fs
    .readFileSync("file.txt", "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const names = fs.existsSync("names.txt")
    ? fs.readFileSync("names.txt", "utf8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const delayInMs = 20000; // 20s between comments
  let cycle = 1;

  const composerSelectors = [
    'div[aria-label="Write a comment"]',
    'div[aria-label="Write a comment…"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[data-lexical-editor="true"] div[contenteditable="true"]',
    'div[contenteditable="true"]',
  ];

  while (true) {
    console.log(`🔁 Starting comment cycle ${cycle}...`);

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      const name = names.length > 0 ? names[i % names.length] : "";
      const finalComment = name ? `${name} ${comment}` : comment;

      try {
        await delay(1500);

        const sel = await findVisibleElement(page, composerSelectors, 20000);
        if (!sel) {
          console.error(
            "❌ Composer not found. Saving debug screenshot."
          );
          await page.screenshot({
            path: `composer-not-found-${Date.now()}.png`,
          });
          throw new Error("Composer not found by any selector");
        }

        console.log("✅ Found composer using selector:", sel);

        await page.evaluate((s) => {
          document.querySelector(s).scrollIntoView();
          document.querySelector(s).click();
        }, sel);

        await delay(500);

        const success = await setElementText(page, sel, finalComment);
        if (!success) throw new Error("Failed to set composer text");

        await page.keyboard.press("Enter");
        await delay(2000);

        await page.screenshot({ path: `after-comment-${Date.now()}.png` });
        console.log("✅ Commented:", finalComment);

        await delay(delayInMs);
      } catch (err) {
        console.error("❌ Failed to comment:", finalComment, err.message);
      }
    }
    cycle++;
  }
})();
