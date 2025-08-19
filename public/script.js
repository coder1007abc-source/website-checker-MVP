document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const checkButton = document.getElementById('checkButton');
    const resultsDiv = document.getElementById('results');
    const errorDiv = document.getElementById('error');
    const sections = [
        { id: 'functionality', name: 'Functionality' },
        { id: 'security', name: 'Security' },
        { id: 'seo', name: 'SEO' },
        { id: 'uifeatures', name: 'UIFeatures' }
    ];
    let lastResults = null; // Store the last test results

    // Verify all required elements exist
    const errorMessage = document.createElement('p');
    errorMessage.className = 'error-message';
    if (!errorDiv) {
        console.error('Error div not found');
        document.body.appendChild(errorMessage);
    }

    checkButton.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        
        if (!url) {
            showError('Please enter a valid URL');
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
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                throw new Error('Failed to check website');
            }

            const results = await response.json();
            lastResults = results;
            
            // Show results div before updating tables
            resultsDiv.classList.remove('hidden');

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
                Object.entries(results[section.name]).forEach(([test, value]) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${test}</td>
                        <td class="${value ? 'success' : 'failure'}">
                            ${value ? '✓' : '✗'}
                        </td>
                    `;
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
