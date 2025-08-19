# Website Checker

A comprehensive tool for analyzing websites and generating detailed reports. This application performs various checks across multiple aspects of a website including functionality, security, SEO, and UI features.

## Features

- Multiple test categories:
  - Functionality Tests
  - Security Tests
  - SEO Tests
  - UI Feature Tests
- Downloadable reports in:
  - Excel format
  - PDF format
- Real-time analysis
- User-friendly interface

## Installation

1. Clone the repository:
```bash
git clone https://github.com/bhavyashreeprasad-commits/website-checker.git
cd website-checker
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
node server.js
```

The application will be available at `http://localhost:3000`

## Usage

1. Enter a website URL in the input field
2. Click "Check Website" to start the analysis
3. View the results in different categories
4. Download the report in Excel or PDF format

## Technologies Used

- Backend:
  - Node.js
  - Express
  - Puppeteer (for advanced website testing)
  - Cheerio (for HTML parsing)
  - ExcelJS (for Excel report generation)
  - PDFKit (for PDF report generation)

- Frontend:
  - HTML5
  - CSS3
  - JavaScript
