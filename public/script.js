document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const checkButton = document.getElementById('checkButton');
    const resultsDiv = document.getElementById('results');
    const errorDiv = document.getElementById('error');
    const sections = [
        { id: 'functionality', name: 'Functionality' },
        { id: 'security', name: 'Security' },
        { id: 'seo', name: 'SEO' },
        { id: 'uifeatures', name: 'UIFeatures' },
        { id: 'sitemap', name: 'Sitemap' }
    ];
    let lastResults = null; // Store the last test results

    // Verify all required elements exist
    const errorMessage = document.createElement('p');
    errorMessage.className = 'error-message';
    if (!errorDiv) {
        console.error('Error div not found');
        document.body.appendChild(errorMessage);
    }

    function isValidUrl(urlString) {
        try {
            new URL(urlString);
            return true;
        } catch (err) {
            return false;
        }
    }

    // Add tooltip functionality
    const tooltip = document.querySelector('.checkbox-tooltip');
    if (tooltip) {
        tooltip.addEventListener('mouseover', (e) => {
            const title = e.target.getAttribute('title');
            if (!title) return;
            
            const tooltipDiv = document.createElement('div');
            tooltipDiv.className = 'tooltip-text';
            tooltipDiv.textContent = title;
            document.body.appendChild(tooltipDiv);
            
            const rect = e.target.getBoundingClientRect();
            tooltipDiv.style.top = rect.bottom + 5 + 'px';
            tooltipDiv.style.left = rect.left + 'px';
            
            e.target.addEventListener('mouseout', () => tooltipDiv.remove(), { once: true });
        });
    }

    checkButton.addEventListener('click', async () => {
        if (!urlInput) {
            console.error('URL input element not found');
            return;
        }

        const url = (urlInput.value || '').trim();
        const isWholeWebsite = document.getElementById('wholeWebsiteCheck')?.checked || false;
        
        // Validate main URL
        if (!url) {
            showError('Please enter a website URL');
            return;
        }
        
        if (!isValidUrl(url)) {
            showError('Please enter a valid website URL (e.g., https://example.com)');
            return;
        }

        try {
            // Show loading state
            checkButton.disabled = true;
            checkButton.textContent = 'Checking...';
            if (resultsDiv) resultsDiv.classList.add('hidden');
            if (errorDiv) errorDiv.classList.add('hidden');
            
            // Add loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'loadingIndicator';
            loadingDiv.className = 'loading';
            loadingDiv.textContent = 'Analyzing website... This may take a few moments.';
            document.querySelector('.container').appendChild(loadingDiv);

            // Send request to backend
            const apiUrl = config.apiUrl || '';
            const response = await fetch(`${apiUrl}/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ 
                    url, 
                    sitemapUrl: isWholeWebsite ? url : undefined 
                })
            });

            if (!response.ok) {
                throw new Error('Failed to check website');
            }

            const results = await response.json();
            lastResults = results;
            
            // Show results div before updating tables
            resultsDiv.classList.remove('hidden');

            // Handle TestLinksOfLinks results if available
            const testLinksSection = document.getElementById('testLinksSection');
            if (results.TestLinksOfLinks) {
                testLinksSection.style.display = 'block';
                document.getElementById('totalLinksCount').textContent = results.TestLinksOfLinks.totalLinks;
                document.getElementById('testedLinksCount').textContent = results.TestLinksOfLinks.testedLinks;

                const linksAccordion = document.getElementById('linksAccordion');
                linksAccordion.innerHTML = ''; // Clear existing results

                results.TestLinksOfLinks.linkResults.forEach((linkResult, index) => {
                    const linkElement = document.createElement('div');
                    linkElement.className = 'link-result';
                    
                    const statusClass = linkResult.statusCode === 200 ? 'status-success' : 'status-error';
                    const statusText = linkResult.statusCode === 200 ? 'Success' : 'Error';
                    
                    const truncateUrl = (url, maxLength = 60) => {
                        if (url.length <= maxLength) return url;
                        const start = url.substring(0, maxLength);
                        return `${start}...`;
                    };

                    const createCopyButton = (url) => {
                        const button = document.createElement('button');
                        button.className = 'copy-button';
                        button.textContent = 'Copy URL';
                        button.onclick = async (e) => {
                            e.stopPropagation(); // Prevent accordion from toggling
                            try {
                                await navigator.clipboard.writeText(url);
                                button.textContent = 'Copied!';
                                button.classList.add('copied');
                                setTimeout(() => {
                                    button.textContent = 'Copy URL';
                                    button.classList.remove('copied');
                                }, 2000);
                            } catch (err) {
                                console.error('Failed to copy:', err);
                            }
                        };
                        return button;
                    };

                    linkElement.innerHTML = `
                        <div class="link-header">
                            <div class="link-url-container" title="${linkResult.url}">
                                <span class="link-url">${truncateUrl(linkResult.url)}</span>
                            </div>
                            <span class="link-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="link-content">
                            <h4>Status Code: ${linkResult.statusCode}</h4>
                            <div class="test-results">
                                ${Object.entries(linkResult.Functionality || {})
                                    .map(([test, value]) => `
                                        <p>${test}: <span class="${value ? 'success' : 'failure'}">${value ? '✓' : '✗'}</span></p>
                                    `).join('')}
                                ${Object.entries(linkResult.Security || {})
                                    .map(([test, value]) => `
                                        <p>${test}: <span class="${value ? 'success' : 'failure'}">${value ? '✓' : '✗'}</span></p>
                                    `).join('')}
                            </div>
                        </div>
                    `;
                    
                    // Add the copy button to the header after HTML is set
                    const header = linkElement.querySelector('.link-header');
                    const urlContainer = header.querySelector('.link-url-container');
                    const copyButton = createCopyButton(linkResult.url);
                    urlContainer.appendChild(copyButton);

                    // Add click handler for accordion toggle
                    header.addEventListener('click', (e) => {
                        if (!e.target.matches('.copy-button')) {
                            linkElement.querySelector('.link-content').classList.toggle('active');
                        }
                    });

                    linksAccordion.appendChild(linkElement);
                });
            } else {
                testLinksSection.style.display = 'none';
            }

            // Update each section's table
            sections.forEach(section => {
                const tableId = section.id + 'Table';
                const table = document.getElementById(tableId);
                
                if (!table) {
                    console.error(`Table not found for section: ${section.name}`);
                    return;
                }

                // Clear existing content
                table.innerHTML = '';

                if (!results[section.name]) {
                    console.error(`No results found for section: ${section.name}`);
                    return;
                }

                // Add results to table
                Object.entries(results[section.name] || {}).forEach(([test, value]) => {
                    const row = document.createElement('tr');
                    
                    if (section.name === 'Sitemap') {
                        // Special handling for sitemap results
                        let statusClass = '';
                        let displayValue = value;
                        
                        try {
                            if (test === 'Sitemap Status') {
                                statusClass = (value === 'Valid') ? 'success' : 'failure';
                                displayValue = String(value || '');
                            } else if (test === 'Total URLs Found') {
                                const numValue = parseInt(value) || 0;
                                statusClass = numValue > 0 ? 'success' : 'neutral';
                                displayValue = String(numValue);
                            } else if (test === 'Parse Error') {
                                statusClass = (value === 'None') ? 'success' : 'failure';
                                displayValue = String(value || '');
                            }
                            
                            row.innerHTML = `
                                <td>${String(test || '')}</td>
                                <td class="${statusClass || ''}">${displayValue}</td>
                            `;
                        } catch (e) {
                            console.error('Error processing sitemap result:', e);
                            row.innerHTML = `
                                <td>${String(test || '')}</td>
                                <td class="neutral">N/A</td>
                            `;
                        }
                    } else {
                        // Original handling for other sections
                        const isSuccess = Boolean(value);
                        row.innerHTML = `
                            <td>${String(test || '')}</td>
                            <td class="${isSuccess ? 'success' : 'failure'}">
                                ${isSuccess ? '✓' : '✗'}
                            </td>
                        `;
                    }
                    
                    table.appendChild(row);
                    
                    table.appendChild(row);
                });
            });

            resultsDiv.classList.remove('hidden');
        } catch (error) {
            showError(error.message);
        } finally {
            checkButton.disabled = false;
            checkButton.textContent = 'Test';
            // Remove loading indicator
            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) loadingIndicator.remove();
        }
    });

    function showError(message) {
        errorDiv.querySelector('.error-message').textContent = message;
        errorDiv.classList.remove('hidden');
        if (!lastResults) {
            resultsDiv.classList.add('hidden');
        }
    }

    function setDownloadButtonState(button, isLoading) {
        const originalText = button.textContent;
        button.disabled = isLoading;
        button.textContent = isLoading ? 'Downloading...' : originalText;
    }

    // Download buttons functionality
    const downloadExcel = document.getElementById('downloadExcel');
    const downloadPDF = document.getElementById('downloadPDF');

    downloadExcel.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url || !lastResults) {
            showError('Please run the website test first');
            return;
        }

        setDownloadButtonState(downloadExcel, true);
        try {
            console.log('Preparing Excel download...');
            const downloadData = {
                results: lastResults,
                url: url
            };
            
            const apiUrl = config.apiUrl || '';
            const response = await fetch(`${apiUrl}/download/excel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(downloadData)
            });

            if (!response.ok) throw new Error('Failed to generate Excel file');

            // Convert the response to a blob and download it
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate Excel file');
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'website-check-results.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            console.error('Excel download error:', error);
            showError(error.message || 'Failed to download Excel file');
        } finally {
            setDownloadButtonState(downloadExcel, false);
        }
    });

    downloadPDF.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url || !lastResults) {
            showError('Please run the website test first');
            return;
        }

        setDownloadButtonState(downloadPDF, true);
        try {
            console.log('Preparing PDF download data:', lastResults);
            const apiUrl = config.apiUrl || '';
            const response = await fetch(`${apiUrl}/download/pdf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    results: lastResults,
                    url
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate PDF file');
            }

            // Convert the response to a blob and download it
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'website-check-results.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
            console.log('PDF downloaded successfully');
        } catch (error) {
            console.error('PDF download error:', error);
            showError(error.message || 'Failed to download PDF file');
        } finally {
            setDownloadButtonState(downloadPDF, false);
        }
    });
});
