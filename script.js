const puppeteer = require("puppeteer");
const fs = require("fs");

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// --- helper: try multiple selectors and return first visible element handle + selector
async function findVisibleElement(page, selectors, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (!el) continue;
        const box = await el.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          return { el, sel };
        }
      } catch (e) {
        // ignore selector errors
      }
    }
    await page.waitForTimeout(300);
  }
  return null;
}

// --- safe method to set text in contenteditable or textarea/input
async function setElementText(page, selector, text) {
  try {
    // Try typing first
    await page.focus(selector);
    await page.keyboard.type(text, { delay: 30 });
    return true;
  } catch (err) {
    // Fallback: set via DOM and dispatch input events
    const ok = await page.evaluate(
      (sel, txt) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        if (el.isContentEditable) {
          // set text nodes
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
      },
      selector,
      text
    );
    return ok;
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false, // set to true when stable; false helps debugging
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // Force desktop UA (helps keep consistent layout)
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  // Load cookies
  if (!fs.existsSync("cookies.json")) {
    console.error("cookies.json missing — add your cookies file first.");
    await browser.close();
    return;
  }
  const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf8"));
  await page.setCookie(...cookies);

  // Post URL
  const postUrl =
    "https://www.facebook.com/61550558518720/posts/pfbid03kYYF6RN2FEBNW8TVRpFDgsHKuRWakijmFdVcraY1v6yPpPN4vPPegJN9YXCHDdml/?app=fbl";
  await page.goto(postUrl, { waitUntil: "networkidle2" });

  // Screenshot to verify
  await page.screenshot({ path: "post-opened.png" });
  console.log("📸 Screenshot saved: post-opened.png");

  // Read comments & names
  if (!fs.existsSync("file.txt")) {
    console.error("file.txt missing — create it with one comment per line.");
    await browser.close();
    return;
  }
  const comments = fs.readFileSync("file.txt", "utf8").split("\n").map(s => s.trim()).filter(Boolean);
  const names = fs.existsSync("names.txt") ? fs.readFileSync("names.txt", "utf8").split("\n").map(s => s.trim()).filter(Boolean) : [];

  if (comments.length === 0) {
    console.error("No comments found in file.txt");
    await browser.close();
    return;
  }

  const delayInMs = 20000; // 20s between comments (adjust as needed)
  let cycle = 1;

  // selectors to try for the comment composer
  const composerSelectors = [
    'div[aria-label="Write a comment"]',
    'div[aria-label="Write a comment…"]',
    'div[role="textbox"][contenteditable="true"]',
    '[data-lexical-editor="true"] div[contenteditable="true"]',
    '[role="presentation"] div[contenteditable="true"]',
    'div[contenteditable="true"]',
    '[data-testid="status-attachment-mentions-input"]',
    'textarea'
  ];

  while (true) {
    console.log(`🔁 Starting comment cycle ${cycle}...`);
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      const name = names.length > 0 ? names[i % names.length] : "";
      const finalComment = name ? `${name} ${comment}` : comment;

      try {
        // Wait a bit for dynamic content
        await page.waitForTimeout(1500);

        // Find visible composer
        const found = await findVisibleElement(page, composerSelectors, 15000);
        if (!found) {
          console.error("❌ Composer not found. Saving debug screenshot.");
          await page.screenshot({ path: `composer-not-found-${Date.now()}.png` });
          throw new Error("Composer not found by any selector");
        }
        console.log("✅ Found composer using selector:", found.sel);

        // If the composer is not directly clickable (sometimes hidden), try clicking an accessible label or the container
        try {
          await found.el.click({ delay: 50 });
        } catch (clickErr) {
          // fallback: click via evaluate
          await page.evaluate(sel => {
            const el = document.querySelector(sel);
            if (el) el.click();
          }, found.sel);
        }

        // Give FB a moment to attach events
        await page.waitForTimeout(500);

        // Try to set the text (typing first, evaluate fallback inside)
        const success = await setElementText(page, found.sel, finalComment);
        if (!success) throw new Error("Failed to set composer text");

        // Submit: try Enter, else try click on Post/Send button if exists
        try {
          await page.keyboard.press("Enter");
        } catch (e) {
          // no-op; we'll try to find a button (rare)
        }

        // wait and screenshot success
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `after-comment-${Date.now()}.png` });
        console.log("✅ Commented:", finalComment);

        // delay between comments
        await delay(delayInMs);
      } catch (err) {
        console.error("❌ Failed to comment:", finalComment, err.message);
        // save screenshot for debugging
        await page.screenshot({ path: `comment-error-${Date.now()}.png` });
        // continue to next comment
      }
    }
    cycle++;
  }

  // never reached
  // await browser.close();
})();
