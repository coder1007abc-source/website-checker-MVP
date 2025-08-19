require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer-core');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
    origin: ['http://localhost:3000', 'https://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));

app.post('/check', async (req, res) => {
    const { url } = req.body;
    const results = {
        Functionality: {},
        Security: {},
        SEO: {},
        UIFeatures: {}
    };

    let browser;
    let page;

    try {
        const startTime = Date.now();
        
        // Make initial request
        const response = await axios.get(url, {
            timeout: 30000,
            httpsAgent: new https.Agent({ 
                rejectUnauthorized: false,
                timeout: 30000 
            }),
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 500
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Launch puppeteer for advanced checks
        try {
            console.log('Launching Puppeteer with deployment configuration...');
            // This is for backend testing only, not related to user's browser choice
            const browserPaths = [
                process.env.CHROME_PATH,
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                process.env.PUPPETEER_EXECUTABLE_PATH
            ];

            // Find the first available browser
            let browserPath = null;
            for (const path of browserPaths) {
                if (path) {
                    browserPath = path;
                    break;
                }
            }

            if (!browserPath) {
                console.warn('No browser path found, using default configuration');
            }

            browser = await puppeteer.launch({ 
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-accelerated-2d-canvas'
                ],
                headless: 'new',
                executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome'
            });
            console.log('Puppeteer launched successfully');
            
            page = await browser.newPage();
            await page.setDefaultNavigationTimeout(90000); // Increased timeout
            console.log(`Navigating to ${url}...`);
            await page.goto(url, { 
                waitUntil: 'networkidle0',
                timeout: 90000  // Increased timeout for production
            });
            console.log('Page loaded successfully');
        } catch (e) {
            console.error('Puppeteer error:', e);
            results.error = 'Error during website analysis: ' + e.message;
            // Continue with other checks even if Puppeteer fails
        }

        // 1. Functionality Tests
        results.Functionality['Links working'] = await checkLinks($, url);
        results.Functionality['No broken images'] = await checkImages($, url);
        results.Functionality['Forms present'] = $('form').length > 0;
        results.Functionality['Forms valid'] = $('form input[name]').length > 0;
        results.Functionality['Page load < 3s'] = (Date.now() - startTime) / 1000 < 3;
        results.Functionality['Mobile responsive'] = !!$('meta[name="viewport"][content*="width=device-width"]').length;
        results.Functionality['Navigation menu'] = $('nav, header nav, .nav, .navigation').length > 0;

        // 2. Security Tests
        results.Security['SSL enabled'] = url.startsWith('https://');
        results.Security['SSL expiry valid'] = await checkSSLCertificate(url);
        results.Security['No mixed content'] = !html.includes('http://');
        results.Security['Cookies Secure'] = await checkCookiesSecurity(page);
        results.Security['Cookies HttpOnly'] = await checkCookiesHttpOnly(page);
        results.Security['X-Frame-Options'] = await checkSecurityHeaders(page, 'X-Frame-Options');
        results.Security['Content-Security-Policy'] = await checkSecurityHeaders(page, 'Content-Security-Policy');

        // 3. SEO Tests
        results.SEO['Page title'] = $('title').length > 0;
        results.SEO['Meta description'] = $('meta[name="description"]').length > 0;
        results.SEO['Meta keywords'] = $('meta[name="keywords"]').length > 0;
        results.SEO['Open Graph tags'] = $('meta[property^="og:"]').length > 0;
        results.SEO['Twitter meta tags'] = $('meta[name^="twitter:"]').length > 0;
        results.SEO['robots.txt exists'] = await checkRobotsTxt(url);
        results.SEO['sitemap.xml exists'] = await checkSitemapXml(url);

        // 4. UI Features Tests
        results.UIFeatures['Responsive meta tag'] = $('meta[name="viewport"]').length > 0;
        results.UIFeatures['Fonts load'] = await checkFonts($);
        results.UIFeatures['No inline styles'] = $('[style]').length === 0;
        results.UIFeatures['Images have alt'] = checkImagesAlt($);
        results.UIFeatures['Color contrast'] = await checkColorContrast(page);
        results.UIFeatures['Buttons accessible'] = checkButtonsAccessibility($);
        results.UIFeatures['Brand/logo present'] = $('img[alt*="logo" i], img[src*="logo" i], .logo').length > 0;

        res.json(results);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            error: 'Failed to check website',
            details: error.message
        });
    } finally {
        if (browser) {
            await browser.close().catch(console.error);
        }
    }
});

// Helper functions
async function checkLinks($, baseUrl) {
    const links = $('a[href]');
    const checkedLinks = Math.min(links.length, 5);
    let working = 0;

    for (let i = 0; i < checkedLinks; i++) {
        const href = $(links[i]).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            try {
                const url = href.startsWith('http') ? href : new URL(href, baseUrl).href;
                const response = await axios.head(url, { timeout: 5000 });
                if (response.status < 400) working++;
            } catch (e) {}
        }
    }
    return working > 0;
}

async function checkImages($, baseUrl) {
    const images = $('img[src]');
    const checkedImages = Math.min(images.length, 5);
    let working = 0;

    for (let i = 0; i < checkedImages; i++) {
        const src = $(images[i]).attr('src');
        if (src) {
            try {
                const url = src.startsWith('http') ? src : new URL(src, baseUrl).href;
                const response = await axios.head(url, { timeout: 5000 });
                if (response.status < 400) working++;
            } catch (e) {}
        }
    }
    return working > 0;
}

async function checkSSLCertificate(url) {
    try {
        const { hostname } = new URL(url);
        return new Promise((resolve) => {
            const socket = require('tls').connect(443, hostname, { servername: hostname }, () => {
                const valid = socket.authorized;
                socket.end();
                resolve(valid);
            });
            socket.on('error', () => resolve(false));
        });
    } catch (e) {
        return false;
    }
}

async function checkCookiesSecurity(page) {
    if (!page) return false;
    try {
        const cookies = await page.cookies();
        return cookies.some(cookie => cookie.secure);
    } catch (e) {
        return false;
    }
}

async function checkCookiesHttpOnly(page) {
    if (!page) return false;
    try {
        const cookies = await page.cookies();
        return cookies.some(cookie => cookie.httpOnly);
    } catch (e) {
        return false;
    }
}

async function checkSecurityHeaders(page, header) {
    if (!page) return false;
    try {
        const headers = await page.evaluate(() => {
            return Object.fromEntries(
                Array.from(document.getElementsByTagName('meta'))
                    .filter(m => m.httpEquiv)
                    .map(m => [m.httpEquiv, m.content])
            );
        });
        return !!headers[header];
    } catch (e) {
        return false;
    }
}

async function checkRobotsTxt(url) {
    try {
        const robotsUrl = new URL('/robots.txt', url).href;
        const response = await axios.head(robotsUrl, { timeout: 5000 });
        return response.status === 200;
    } catch (e) {
        return false;
    }
}

async function checkSitemapXml(url) {
    try {
        const sitemapUrl = new URL('/sitemap.xml', url).href;
        const response = await axios.head(sitemapUrl, { timeout: 5000 });
        return response.status === 200;
    } catch (e) {
        return false;
    }
}

async function checkFonts($) {
    const fontLinks = $('link[rel="stylesheet"][href*="font"]').length;
    const fontFace = $('style:contains("@font-face")').length;
    return fontLinks > 0 || fontFace > 0;
}

function checkImagesAlt($) {
    let hasAlt = true;
    $('img').each((_, img) => {
        if (!$(img).attr('alt')) hasAlt = false;
    });
    return hasAlt;
}

async function checkColorContrast(page) {
    if (!page) return true;
    try {
        return await page.evaluate(() => {
            const elements = document.querySelectorAll('body, body *');
            for (const el of elements) {
                const style = window.getComputedStyle(el);
                if (style.color === style.backgroundColor) return false;
            }
            return true;
        });
    } catch (e) {
        return true;
    }
}

function checkButtonsAccessibility($) {
    let accessible = true;
    $('button').each((_, btn) => {
        const $btn = $(btn);
        if (!$btn.attr('aria-label') && !$btn.text().trim()) {
            accessible = false;
        }
    });
    return accessible;
}

// Excel download endpoint
app.post('/download/excel', async (req, res) => {
    console.log('Excel download requested...');
    try {
        const { results, url } = req.body;
        
        if (!results || !url) {
            console.error('Missing required data for Excel generation');
            return res.status(400).json({ error: 'Missing required data' });
        }
        
        console.log('Creating Excel workbook...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Website Check Results');
        
        worksheet.columns = [
            { header: 'Category', key: 'category', width: 20 },
            { header: 'Test', key: 'test', width: 30 },
            { header: 'Status', key: 'status', width: 20 }
        ];
    
    // Add title rows
    worksheet.addRow(['Website URL:', url]);
    worksheet.addRow(['Check Date:', new Date().toLocaleDateString()]);
    worksheet.addRow([]);
    
    // Add results by category in specific order
    const categories = ['Functionality', 'Security', 'SEO', 'UIFeatures'];
    categories.forEach(category => {
        if (results[category]) {
            worksheet.addRow([category]);
            Object.entries(results[category]).forEach(([test, value]) => {
                worksheet.addRow({
                    category: '',
                    test: test,
                    status: value ? 'Pass' : 'Fail'
                });
            });
            worksheet.addRow([]);
        }
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=website-check-results.xlsx');
    
    console.log('Writing Excel workbook...');
    await workbook.xlsx.write(res);
    console.log('Excel generation completed successfully');
    res.end();
  } catch (error) {
    console.error('Error generating Excel file:', error);
    res.status(500).json({ error: 'Failed to generate Excel file' });
  }
});

// PDF download endpoint
app.post('/download/pdf', async (req, res) => {
    console.log('PDF download requested...');
    try {
        const { results, url } = req.body;
        
        if (!results || !url) {
            console.error('Missing required data for PDF generation');
            return res.status(400).json({ error: 'Missing required data' });
        }
        
        // Validate results structure
        const expectedSections = ['Functionality', 'Security', 'SEO', 'UIFeatures'];
        const hasValidStructure = expectedSections.some(section => results[section] && typeof results[section] === 'object');
        
        if (!hasValidStructure) {
            console.error('Invalid results structure:', results);
            return res.status(400).json({ error: 'Invalid results structure' });
        }
        
        console.log('Creating PDF document...');
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=website-check-results.pdf');
        
        doc.pipe(res);
    
        // Add title
        doc.fontSize(20).text('Website Check Results', { align: 'center' });
        doc.moveDown();
        
        // Add URL and date
        doc.fontSize(12)
            .text(`Website URL: ${url}`)
            .text(`Check Date: ${new Date().toLocaleDateString()}`)
            .moveDown();
        
    // Add results by category
    let yPos = doc.y;
    console.log('Processing results for PDF:', results);
    
    const sections = ['Functionality', 'Security', 'SEO', 'UIFeatures'];
    sections.forEach(category => {
        if (results[category]) {
            doc.font('Helvetica-Bold').fontSize(14).text(category, 50, yPos);
            yPos += 25;
            
            doc.font('Helvetica').fontSize(12);
            Object.entries(results[category]).forEach(([test, value]) => {
                if (yPos > 700) { // Start new page if near bottom
                    doc.addPage();
                    yPos = 50;
                }
                doc.text(test, 70, yPos);
                doc.text(value ? 'Pass' : 'Fail', 300, yPos);
                yPos += 20;
            });
            
            yPos += 10;
        }
    });        console.log('Finishing PDF generation...');
        doc.end();
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ error: 'Failed to generate PDF file' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
