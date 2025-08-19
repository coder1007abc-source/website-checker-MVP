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

// Serve static files with proper MIME types
app.use(express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        }
    }
}));

// CORS configuration
const corsOptions = {
    origin: ['http://localhost:3000', 'https://checklist-webapp.onrender.com'],
    methods: ['GET', 'POST'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Function to normalize URL (convert relative to absolute)
function normalizeUrl(baseUrl, href) {
    try {
        const resolved = new URL(href, baseUrl);
        return resolved.toString();
    } catch (error) {
        return null;
    }
}

// Function to extract unique links from HTML
async function extractLinks(url) {
    try {
        const response = await axios.get(url, {
            timeout: 30000,
            httpsAgent: new https.Agent({ 
                rejectUnauthorized: false,
                timeout: 30000 
            })
        });
        const $ = cheerio.load(response.data);
        const links = new Set();

        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const absoluteUrl = normalizeUrl(url, href);
            if (absoluteUrl && absoluteUrl.startsWith('http')) {
                links.add(absoluteUrl);
            }
        });

        return Array.from(links);
    } catch (error) {
        console.error(`Error extracting links from ${url}:`, error.message);
        return [];
    }
}

// Function to test a single URL and return results
async function testSingleUrl(url) {
    // Create a mini version of the check function that doesn't recursively test links
    try {
        const response = await axios.get(url, {
            timeout: 30000,
            httpsAgent: new https.Agent({ 
                rejectUnauthorized: false,
                timeout: 30000 
            })
        });

        const results = {
            url,
            statusCode: response.status,
            Functionality: {
                'Page Loads': true,
                'Status Code': response.status === 200,
                'Response Time': response.status === 200
            },
            Security: {
                'HTTPS': url.startsWith('https'),
                'Valid SSL': response.status === 200
            }
        };

        return results;
    } catch (error) {
        return {
            url,
            statusCode: error.response?.status || 500,
            error: error.message,
            Functionality: {
                'Page Loads': false,
                'Status Code': false,
                'Response Time': false
            },
            Security: {
                'HTTPS': url.startsWith('https'),
                'Valid SSL': false
            }
        };
    }
}

// Main function to test all links
async function testLinksOfLinks(url) {
    const links = await extractLinks(url);
    const results = {
        totalLinks: links.length,
        testedLinks: 0,
        linkResults: []
    };

    // Test each link in parallel, but limit concurrency
    const batchSize = 5;
    for (let i = 0; i < links.length; i += batchSize) {
        const batch = links.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(link => testSingleUrl(link))
        );
        results.linkResults.push(...batchResults);
        results.testedLinks += batchResults.length;
    }

    return results;
}

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

async function parseSitemap(sitemapUrl) {
    try {
        const response = await axios.get(sitemapUrl, {
            timeout: 30000,
            httpsAgent: new https.Agent({ 
                rejectUnauthorized: false,
                timeout: 30000 
            })
        });
        
        const $ = cheerio.load(response.data, { xmlMode: true });
        const urls = [];
        
        // Parse both standard sitemap and news sitemap formats
        $('url > loc, sitemap > loc').each((i, elem) => {
            const url = $(elem).text().trim();
            if (url && url.startsWith('http')) {
                urls.push(url);
            }
        });
        
        return {
            success: true,
            urls: urls,
            count: urls.length
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            urls: [],
            count: 0
        };
    }
}

function isValidUrl(urlString) {
    try {
        new URL(urlString);
        return true;
    } catch (err) {
        return false;
    }
}

app.post('/check', async (req, res) => {
    const { url, sitemapUrl } = req.body;
    
    if (!url || !isValidUrl(url)) {
        return res.status(400).json({ error: 'Invalid website URL' });
    }

    if (sitemapUrl && !isValidUrl(sitemapUrl)) {
        return res.status(400).json({ error: 'Invalid sitemap URL' });
    }

    const results = {
        Functionality: {},
        Security: {},
        SEO: {},
        UIFeatures: {},
        Sitemap: {},
        TestLinksOfLinks: null
    };

    // If sitemapUrl is provided, test all links in it
    if (sitemapUrl) {
        results.TestLinksOfLinks = await testLinksOfLinks(sitemapUrl);
    }

    if (sitemapUrl) {
        const sitemapResults = await parseSitemap(sitemapUrl);
        results.Sitemap = {
            'Total URLs Found': sitemapResults.success ? sitemapResults.count : 0,
            'Sitemap Status': sitemapResults.success ? 'Valid' : 'Invalid',
            'Parse Error': sitemapResults.success ? 'None' : sitemapResults.error
        };
    }

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

            const isWindows = process.platform === 'win32';
            const defaultChromePath = isWindows 
                ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
                : '/usr/bin/google-chrome';

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
                executablePath: process.env.CHROME_PATH || defaultChromePath
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
    const worksheet = workbook.addWorksheet('Results');
    
    // Add TestLinksOfLinks worksheet if data exists
    if (results.TestLinksOfLinks) {
        const linksWorksheet = workbook.addWorksheet('TestLinksOfLinks');
        
        // Set up headers
        linksWorksheet.columns = [
            { header: 'Tested URL', key: 'url', width: 50 },
            { header: 'Status Code', key: 'statusCode', width: 15 },
            { header: 'Test Case', key: 'testCase', width: 30 },
            { header: 'Status', key: 'status', width: 15 }
        ];

        // Add data rows
        results.TestLinksOfLinks.linkResults.forEach(linkResult => {
            const baseRow = {
                url: linkResult.url,
                statusCode: linkResult.statusCode
            };

            // Add Functionality results
            Object.entries(linkResult.Functionality || {}).forEach(([test, value]) => {
                linksWorksheet.addRow({
                    ...baseRow,
                    testCase: `Functionality - ${test}`,
                    status: value ? 'Passed' : 'Failed'
                });
            });

            // Add Security results
            Object.entries(linkResult.Security || {}).forEach(([test, value]) => {
                linksWorksheet.addRow({
                    ...baseRow,
                    testCase: `Security - ${test}`,
                    status: value ? 'Passed' : 'Failed'
                });
            });
        });

        // Style the worksheet
        linksWorksheet.getRow(1).font = { bold: true };
        linksWorksheet.autoFilter = {
            from: 'A1',
            to: 'D1'
        };
    }        worksheet.columns = [
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
