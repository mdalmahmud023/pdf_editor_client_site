// Document ready function
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the UI components
    initializeUI();
    
    // Set up event handlers
    setupEventHandlers();
});

// Initialize UI components
function initializeUI() {
    // Tab switching functionality
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });

    // Navbar Toggle Script
    const navbarToggle = document.getElementById('navbarToggle');
    const navbarMenu = document.getElementById('navbarMenu');
    
    navbarToggle.addEventListener('click', () => {
        navbarMenu.classList.toggle('active');
    });
}

// Set up event handlers for file operations
function setupEventHandlers() {
    setupMergeHandlers();
    setupSplitHandlers();
}

// Handlers for PDF merging functionality
function setupMergeHandlers() {
    const mergeFileInput = document.getElementById('mergeFileInput');
    const mergeUploadContainer = document.getElementById('mergeUploadContainer');
    const mergeSelectedFilesContainer = document.getElementById('mergeSelectedFiles');
    const mergeSubmitBtn = document.getElementById('mergeSubmitBtn');
    const mergeErrorMessage = document.getElementById('mergeErrorMessage');
    
    let mergeSelectedFiles = [];
    
    // Handle file input change
    mergeFileInput.addEventListener('change', () => {
        mergeSelectedFiles = Array.from(mergeFileInput.files)
            .filter(file => file.type === 'application/pdf');
        
        updateMergeSelectedFilesUI();
        updateMergeSubmitButtonState();
    });
    
    // Handle drag and drop
    mergeUploadContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        mergeUploadContainer.style.borderColor = '#2ecc71';
        mergeUploadContainer.style.backgroundColor = 'rgba(46, 204, 113, 0.05)';
    });
    
    mergeUploadContainer.addEventListener('dragleave', () => {
        mergeUploadContainer.style.borderColor = '#00b4ab';
        mergeUploadContainer.style.backgroundColor = '';
    });
    
    mergeUploadContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        mergeUploadContainer.style.borderColor = '#00b4ab';
        mergeUploadContainer.style.backgroundColor = '';
        
        const droppedFiles = Array.from(e.dataTransfer.files)
            .filter(file => file.type === 'application/pdf');
            
        if (droppedFiles.length) {
            mergeSelectedFiles = droppedFiles;
            updateMergeSelectedFilesUI();
            updateMergeSubmitButtonState();
        } else {
            showErrorMessage(mergeErrorMessage, 'Only PDF files are allowed.');
        }
    });
    
    // Handle merge button click
    mergeSubmitBtn.addEventListener('click', async () => {
        if (mergeSelectedFiles.length < 2) {
            showErrorMessage(mergeErrorMessage, 'Please select at least two PDF files to merge.');
            return;
        }
        
        showLoadingOverlay();
        
        try {
            const mergedPdfBytes = await mergePDFs(mergeSelectedFiles);
            download(mergedPdfBytes, 'merged.pdf', 'application/pdf');
            mergeErrorMessage.textContent = '';
        } catch (error) {
            showErrorMessage(mergeErrorMessage, `Error merging PDFs: ${error.message}`);
        } finally {
            hideLoadingOverlay();
        }
    });
    
    // Update UI with selected files
    function updateMergeSelectedFilesUI() {
        mergeSelectedFilesContainer.innerHTML = '';
        
        if (mergeSelectedFiles.length > 0) {
            mergeSelectedFilesContainer.classList.remove('hidden');
            
            mergeSelectedFiles.forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                
                const fileName = document.createElement('span');
                fileName.className = 'file-name';
                fileName.textContent = file.name;
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-file';
                removeBtn.textContent = 'Remove';
                removeBtn.type = 'button';
                removeBtn.addEventListener('click', () => removeMergeFile(index));
                
                fileItem.appendChild(fileName);
                fileItem.appendChild(removeBtn);
                mergeSelectedFilesContainer.appendChild(fileItem);
            });
        } else {
            mergeSelectedFilesContainer.classList.add('hidden');
        }
    }
    
    // Remove a file from the merge list
    function removeMergeFile(index) {
        mergeSelectedFiles.splice(index, 1);
        updateMergeSelectedFilesUI();
        updateMergeSubmitButtonState();
    }
    
    // Update submit button state based on selected files
    function updateMergeSubmitButtonState() {
        mergeSubmitBtn.disabled = mergeSelectedFiles.length < 2;
    }
}

// Handlers for PDF splitting functionality
function setupSplitHandlers() {
    const splitFileInput = document.getElementById('splitFileInput');
    const splitUploadContainer = document.getElementById('splitUploadContainer');
    const splitSelectedFileContainer = document.getElementById('splitSelectedFile');
    const splitSubmitBtn = document.getElementById('splitSubmitBtn');
    const pageOptionsContainer = document.getElementById('pageOptionsContainer');
    const pdfInfoContainer = document.getElementById('pdfInfo');
    const totalPagesSpan = document.getElementById('totalPages');
    const pagesInput = document.getElementById('pages');
    const extractAllInput = document.getElementById('extractAll');
    const customRangeOption = document.getElementById('customRangeOption');
    const allPagesOption = document.getElementById('allPagesOption');
    const splitErrorMessage = document.getElementById('splitErrorMessage');
    
    let splitSelectedFile = null;
    let totalPages = 0;
    
    // Handle extraction option selection
    customRangeOption.addEventListener('click', function() {
        customRangeOption.classList.add('active');
        allPagesOption.classList.remove('active');
        extractAllInput.value = "false";
        pagesInput.disabled = false;
    });
    
    allPagesOption.addEventListener('click', function() {
        allPagesOption.classList.add('active');
        customRangeOption.classList.remove('active');
        extractAllInput.value = "true";
        pagesInput.disabled = true;
    });
    
    // Handle file input change
    splitFileInput.addEventListener('change', handleSplitFileSelection);
    
    // Handle drag and drop
    splitUploadContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        splitUploadContainer.style.borderColor = '#2ecc71';
        splitUploadContainer.style.backgroundColor = 'rgba(46, 204, 113, 0.05)';
    });
    
    splitUploadContainer.addEventListener('dragleave', () => {
        splitUploadContainer.style.borderColor = '#00b4ab';
        splitUploadContainer.style.backgroundColor = '';
    });
    
    splitUploadContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        splitUploadContainer.style.borderColor = '#00b4ab';
        splitUploadContainer.style.backgroundColor = '';
        
        if (e.dataTransfer.files.length) {
            const file = e.dataTransfer.files[0];
            if (file.type === 'application/pdf') {
                splitSelectedFile = file;
                handleSplitFileSelection();
            } else {
                showErrorMessage(splitErrorMessage, 'Only PDF files are allowed.');
                splitSelectedFile = null;
                updateSplitSelectedFileUI();
                updateSplitSubmitButtonState();
                pageOptionsContainer.classList.add('hidden');
                pdfInfoContainer.classList.add('hidden');
            }
        }
    });
    
    // Handle split button click
    splitSubmitBtn.addEventListener('click', async () => {
        if (!splitSelectedFile) {
            showErrorMessage(splitErrorMessage, 'Please select a PDF file to split.');
            return;
        }
        
        showLoadingOverlay();
        
        try {
            const extractAll = extractAllInput.value === 'true';
            let pageRanges = [];
            
            if (!extractAll) {
                const pagesText = pagesInput.value.trim();
                if (!pagesText) {
                    hideLoadingOverlay();
                    showErrorMessage(splitErrorMessage, 'Please enter page numbers or ranges.');
                    return;
                }
                
                pageRanges = parsePageRanges(pagesText, totalPages);
                if (pageRanges.length === 0) {
                    hideLoadingOverlay();
                    showErrorMessage(splitErrorMessage, 'No valid page numbers specified.');
                    return;
                }
            }
            
            if (extractAll) {
                // Extract all pages as individual PDFs
                const pdfBytes = await extractAllPages(splitSelectedFile);
                
                // Create a zip file containing all pages
                if (pdfBytes.length > 1) {
                    const zip = await createZipWithPDFs(pdfBytes);
                    const zipBlob = await zip.generateAsync({ type: 'blob' });
                    download(zipBlob, 'extracted_pages.zip', 'application/zip');
                } else if (pdfBytes.length === 1) {
                    // If there's only one page, just download it directly
                    download(pdfBytes[0], 'extracted_page.pdf', 'application/pdf');
                }
            } else {
                // Extract specific pages
                const extractedPdfBytes = await extractPages(splitSelectedFile, pageRanges);
                download(extractedPdfBytes, 'extracted_pages.pdf', 'application/pdf');
            }
            
            splitErrorMessage.textContent = '';
        } catch (error) {
            showErrorMessage(splitErrorMessage, `Error splitting PDF: ${error.message}`);
        } finally {
            hideLoadingOverlay();
        }
    });
    
    // Handle file selection for splitting
    async function handleSplitFileSelection() {
        if (splitFileInput.files.length > 0) {
            splitSelectedFile = splitFileInput.files[0];
            
            // Check if file is PDF
            if (splitSelectedFile.type === 'application/pdf') {
                updateSplitSelectedFileUI();
                updateSplitSubmitButtonState();
                
                // Show page options
                pageOptionsContainer.classList.remove('hidden');
                
                // Get PDF page count
                try {
                    totalPages = await getPdfPageCount(splitSelectedFile);
                    totalPagesSpan.textContent = totalPages;
                    pdfInfoContainer.classList.remove('hidden');
                } catch (error) {
                    showErrorMessage(splitErrorMessage, `Error reading PDF: ${error.message}`);
                    totalPages = 0;
                    totalPagesSpan.textContent = "Unknown";
                    pdfInfoContainer.classList.remove('hidden');
                }
            } else {
                showErrorMessage(splitErrorMessage, 'Only PDF files are allowed.');
                splitSelectedFile = null;
                updateSplitSelectedFileUI();
                updateSplitSubmitButtonState();
                pageOptionsContainer.classList.add('hidden');
                pdfInfoContainer.classList.add('hidden');
            }
        } else {
            splitSelectedFile = null;
            updateSplitSelectedFileUI();
            updateSplitSubmitButtonState();
            pageOptionsContainer.classList.add('hidden');
            pdfInfoContainer.classList.add('hidden');
        }
    }
    
    // Update UI with selected file
    function updateSplitSelectedFileUI() {
        splitSelectedFileContainer.innerHTML = '';
        
        if (splitSelectedFile) {
            splitSelectedFileContainer.classList.remove('hidden');
            
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            const fileName = document.createElement('span');
            fileName.className = 'file-name';
            fileName.textContent = splitSelectedFile.name;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-file';
            removeBtn.textContent = 'Remove';
            removeBtn.type = 'button';
            removeBtn.addEventListener('click', removeSplitFile);
            
            fileItem.appendChild(fileName);
            fileItem.appendChild(removeBtn);
            splitSelectedFileContainer.appendChild(fileItem);
        } else {
            splitSelectedFileContainer.classList.add('hidden');
        }
    }
    
    // Remove the split file
    function removeSplitFile() {
        splitSelectedFile = null;
        
        // Clear the file input
        splitFileInput.value = '';
        
        updateSplitSelectedFileUI();
        updateSplitSubmitButtonState();
        pageOptionsContainer.classList.add('hidden');
        pdfInfoContainer.classList.add('hidden');
        splitErrorMessage.textContent = '';
    }
    
    // Update submit button state based on selected file
    function updateSplitSubmitButtonState() {
        splitSubmitBtn.disabled = !splitSelectedFile;
    }
}

// Parse page ranges from a string like "1,3,5-7"
function parsePageRanges(text, totalPages) {
    const pageNumbers = new Set();
    
    // Split by comma
    const parts = text.split(',');
    
    for (const part of parts) {
        const trimmedPart = part.trim();
        
        if (trimmedPart.includes('-')) {
            // Handle ranges like "5-7"
            const [start, end] = trimmedPart.split('-').map(num => parseInt(num.trim(), 10));
            if (!isNaN(start) && !isNaN(end) && start >= 1 && start <= end) {
                for (let i = start; i <= end && i <= totalPages; i++) {
                    pageNumbers.add(i);
                }
            }
        } else {
            // Handle single pages like "1"
            const pageNum = parseInt(trimmedPart, 10);
            if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
                pageNumbers.add(pageNum);
            }
        }
    }
    
    return Array.from(pageNumbers).sort((a, b) => a - b);
}

// PDF Operations using pdf-lib

// Get the number of pages in a PDF document
async function getPdfPageCount(file) {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
    return pdf.getPageCount();
}

// Read file as ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        
        reader.readAsArrayBuffer(file);
    });
}

// Merge multiple PDF files
async function mergePDFs(files) {
    try {
        // Create a new PDF document
        const mergedPdf = await PDFLib.PDFDocument.create();
        
        for (const file of files) {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
            
            // Copy all pages from source PDF to merged PDF
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => {
                mergedPdf.addPage(page);
            });
        }
        
        // Save the merged PDF as binary data
        const mergedPdfBytes = await mergedPdf.save();
        return mergedPdfBytes;
    } catch (error) {
        console.error('Error merging PDFs:', error);
        throw error;
    }
}

// Extract specific pages from a PDF
async function extractPages(file, pageRanges) {
    try {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const sourcePdf = await PDFLib.PDFDocument.load(arrayBuffer);
        const extractedPdf = await PDFLib.PDFDocument.create();
        
        // Convert from 1-based page numbers to 0-based indices
        const pageIndices = pageRanges.map(pageNum => pageNum - 1);
        
        // Copy the selected pages
        for (const pageIndex of pageIndices) {
            if (pageIndex >= 0 && pageIndex < sourcePdf.getPageCount()) {
                const [copiedPage] = await extractedPdf.copyPages(sourcePdf, [pageIndex]);
                extractedPdf.addPage(copiedPage);
            }
        }
        
        // Save the extracted PDF as binary data
        const extractedPdfBytes = await extractedPdf.save();
        return extractedPdfBytes;
    } catch (error) {
        console.error('Error extracting pages:', error);
        throw error;
    }
}

// Extract all pages as individual PDFs
async function extractAllPages(file) {
    try {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const sourcePdf = await PDFLib.PDFDocument.load(arrayBuffer);
        const pageCount = sourcePdf.getPageCount();
        const result = [];
        
        for (let i = 0; i < pageCount; i++) {
            const extractedPdf = await PDFLib.PDFDocument.create();
            const [copiedPage] = await extractedPdf.copyPages(sourcePdf, [i]);
            extractedPdf.addPage(copiedPage);
            
            // Save the individual page PDF as binary data
            const pdfBytes = await extractedPdf.save();
            result.push(pdfBytes);
        }
        
        return result;
    } catch (error) {
        console.error('Error extracting all pages:', error);
        throw error;
    }
}

// Create a ZIP file containing multiple PDFs
async function createZipWithPDFs(pdfByteArrays) {
    // Load JSZip dynamically
    if (!window.JSZip) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }
    
    const zip = new JSZip();
    
    pdfByteArrays.forEach((pdfBytes, index) => {
        zip.file(`page_${index + 1}.pdf`, pdfBytes);
    });
    
    return zip;
}

// Load an external script
function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// UI Helper Functions

// Show error message
function showErrorMessage(element, message) {
    element.textContent = message;
    setTimeout(() => {
        element.textContent = '';
    }, 5000); // Clear error after 5 seconds
}

// Show loading overlay
function showLoadingOverlay() {
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

// Hide loading overlay
function hideLoadingOverlay() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

// Animation enhancements
document.addEventListener('DOMContentLoaded', function() {
    // Add initial animations to main elements
    const container = document.querySelector('.container');
    container.classList.add('fade-in');

    // Add float animation to header icon
    const navbarBrand = document.querySelector('.navbar-brand');
    navbarBrand.querySelector('span').classList.add('fade-in');
    
    // Add animated effects to upload containers
    const uploadContainers = document.querySelectorAll('.upload-container');
    uploadContainers.forEach(container => {
        container.querySelector('.upload-icon').classList.add('float-animation');
    });
    
    // Enhance tab switching with animations
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const activeTab = document.querySelector('.tab.active');
            if (activeTab !== this) {
                this.classList.add('bounce-in');
                setTimeout(() => {
                    this.classList.remove('bounce-in');
                }, 600);
            }
        });
    });
    
    // Button hover effects
    const buttons = document.querySelectorAll('.submit-btn');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            if (!this.disabled) {
                this.classList.add('pulse-effect');
            }
        });
        
        button.addEventListener('mouseleave', function() {
            this.classList.remove('pulse-effect');
        });
    });

    // Enhanced loading overlay with particles
    const loadingOverlay = document.getElementById('loadingOverlay');
    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        // Random positioning
        particle.style.top = Math.random() * 100 + '%';
        particle.style.left = Math.random() * 100 + '%';
        // Randomize animation timing
        particle.style.animationDelay = (Math.random() * 2) + 's';
        particle.style.animationDuration = (Math.random() * 3 + 2) + 's';
        loadingOverlay.appendChild(particle);
    }

    // Animate file items when they appear
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList && node.classList.contains('file-item')) {
                        node.classList.add('zoom-in');
                    }
                });
            }
        });
    });
    
    // Watch for file items being added
    const fileContainers = document.querySelectorAll('.selected-files, .selected-file');
    fileContainers.forEach(container => {
        observer.observe(container, { childList: true });
    });
    
    // Add animations to radio options
    const radioOptions = document.querySelectorAll('.radio-option');
    radioOptions.forEach(option => {
        option.addEventListener('click', function() {
            if (!this.classList.contains('active')) {
                this.classList.add('pulse-effect');
                setTimeout(() => {
                    this.classList.remove('pulse-effect');
                }, 1500);
            }
        });
    });
});

// Enhanced drag and drop effects
function setupEnhancedDragEffects(container, isActive = false) {
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        container.style.borderColor = '#2ecc71';
        container.style.backgroundColor = 'rgba(46, 204, 113, 0.05)';
        container.style.transform = 'scale(1.02)';
        container.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.25)';
    });
    
    container.addEventListener('dragleave', () => {
        container.style.borderColor = '#00b4ab';
        container.style.backgroundColor = '';
        container.style.transform = '';
        container.style.boxShadow = '';
    });
    
    container.addEventListener('drop', () => {
        container.style.borderColor = '#00b4ab';
        container.style.backgroundColor = '';
        container.style.transform = '';
        container.style.boxShadow = '';
        
        if (isActive) {
            container.classList.add('pulse-effect');
            setTimeout(() => {
                container.classList.remove('pulse-effect');
            }, 1500);
        }
    });
}

// Initialize enhanced drag effects
setupEnhancedDragEffects(document.getElementById('mergeUploadContainer'), true);
setupEnhancedDragEffects(document.getElementById('splitUploadContainer'), true);

// Enhanced error message display
function showErrorMessage(element, message) {
    element.textContent = message;
    element.style.opacity = '0';
    element.classList.add('fade-in');
    setTimeout(() => {
        element.style.opacity = '1';
    }, 10);
    
    setTimeout(() => {
        element.style.opacity = '0';
        setTimeout(() => {
            element.textContent = '';
            element.style.opacity = '1';
            element.classList.remove('fade-in');
        }, 500);
    }, 4500);
}