const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    
    // Check if there is an error displayed in the DOM
    const mapError = await page.evaluate(() => {
      const el = document.querySelector('.mapLibreCanvas');
      return el ? el.innerText : 'No canvas found';
    });
    
    console.log('DOM Check:', mapError);
    
    await browser.close();
  } catch (err) {
    console.error('Puppeteer Script Error:', err);
  }
})();
