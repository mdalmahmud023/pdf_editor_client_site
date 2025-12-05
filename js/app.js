/**
 * PDF Editor - Main Application
 * A client-side PDF manipulation tool for merging and splitting PDFs.
 * @version 2.0.0
 */

// =========================================
// Utility Functions
// =========================================

/**
 * Format file size to human-readable string
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Read file as ArrayBuffer
 * @param {File} file - The file to read
 * @returns {Promise<ArrayBuffer>} The file contents as ArrayBuffer
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Show error message with auto-dismiss
 * @param {HTMLElement} element - The error message element
 * @param {string} message - The error message to display
 * @param {number} duration - Duration to show message (ms)
 */
function showErrorMessage(element, message, duration = 5000) {
    element.textContent = message;
    element.style.opacity = '1';

    setTimeout(() => {
        element.style.opacity = '0';
        setTimeout(() => {
            element.textContent = '';
            element.style.opacity = '1';
        }, 300);
    }, duration);
}

/**
 * Load an external script dynamically
 * @param {string} url - The script URL to load
 * @returns {Promise<void>}
 */
function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
        document.head.appendChild(script);
    });
}

// =========================================
// Loading Overlay Controller
// =========================================

const LoadingOverlay = {
    overlay: null,
    progressBar: null,
    progressText: null,
    loadingText: null,

    init() {
        this.overlay = document.getElementById('loadingOverlay');
        this.progressBar = document.getElementById('progressBar');
        this.progressText = document.getElementById('progressText');
        this.loadingText = document.getElementById('loadingText');
    },

    show(message = 'Processing your files...') {
        if (this.loadingText) this.loadingText.textContent = message;
        if (this.progressBar) this.progressBar.style.width = '0%';
        if (this.progressText) this.progressText.textContent = '';
        this.overlay?.classList.remove('hidden');
    },

    hide() {
        this.overlay?.classList.add('hidden');
    },

    updateProgress(percent, text = '') {
        if (this.progressBar) {
            this.progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }
        if (this.progressText && text) {
            this.progressText.textContent = text;
        }
    }
};

// =========================================
// Drag & Drop Handler Factory
// =========================================

/**
 * Create drag and drop handlers for an upload container
 * @param {HTMLElement} container - The upload container
 * @param {Function} onDrop - Callback when files are dropped
 * @param {Function} onError - Callback for errors
 */
function setupDragAndDrop(container, onDrop, onError) {
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        container.classList.add('drag-over');
    });

    container.addEventListener('dragleave', (e) => {
        e.preventDefault();
        container.classList.remove('drag-over');
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        container.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);
        const pdfFiles = files.filter(file => file.type === 'application/pdf');

        if (pdfFiles.length === 0) {
            onError('Only PDF files are allowed.');
            return;
        }

        if (pdfFiles.length !== files.length) {
            onError('Some non-PDF files were ignored.');
        }

        onDrop(pdfFiles);
    });
}

// =========================================
// PDF Operations
// =========================================

/**
 * Get the number of pages in a PDF document
 * @param {File} file - The PDF file
 * @returns {Promise<number>} Page count
 */
async function getPdfPageCount(file) {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
    return pdf.getPageCount();
}

// =========================================
// Page Preview Controller
// =========================================

const PagePreview = {
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    zoomLevel: 1,
    file: null,
    selectedPages: new Set(),
    onSelectionChange: null,

    // DOM elements
    elements: {
        previewSection: null,
        thumbnailsContainer: null,
        modal: null,
        previewCanvas: null,
        pageInfo: null,
        prevBtn: null,
        nextBtn: null,
        closeBtn: null,
        zoomInBtn: null,
        zoomOutBtn: null,
        zoomLevel: null
    },

    init() {
        this.elements = {
            previewSection: document.getElementById('pagePreviewSection'),
            thumbnailsContainer: document.getElementById('pageThumbnails'),
            modal: document.getElementById('previewModal'),
            previewCanvas: document.getElementById('previewCanvas'),
            pageInfo: document.getElementById('previewPageInfo'),
            prevBtn: document.getElementById('previewPrevBtn'),
            nextBtn: document.getElementById('previewNextBtn'),
            closeBtn: document.getElementById('previewCloseBtn'),
            zoomInBtn: document.getElementById('zoomInBtn'),
            zoomOutBtn: document.getElementById('zoomOutBtn'),
            zoomLevel: document.getElementById('zoomLevel')
        };

        this.setupEventListeners();
    },

    setupEventListeners() {
        // Modal controls
        this.elements.closeBtn?.addEventListener('click', () => this.closeModal());
        this.elements.prevBtn?.addEventListener('click', () => this.navigatePage(-1));
        this.elements.nextBtn?.addEventListener('click', () => this.navigatePage(1));
        this.elements.zoomInBtn?.addEventListener('click', () => this.adjustZoom(0.25));
        this.elements.zoomOutBtn?.addEventListener('click', () => this.adjustZoom(-0.25));

        // Select/Deselect all buttons
        document.getElementById('selectAllPagesBtn')?.addEventListener('click', () => this.selectAll());
        document.getElementById('deselectAllPagesBtn')?.addEventListener('click', () => this.deselectAll());

        // Close modal on background click
        this.elements.modal?.addEventListener('click', (e) => {
            if (e.target === this.elements.modal) {
                this.closeModal();
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.elements.modal?.classList.contains('hidden')) return;

            switch (e.key) {
                case 'Escape':
                    this.closeModal();
                    break;
                case 'ArrowLeft':
                    this.navigatePage(-1);
                    break;
                case 'ArrowRight':
                    this.navigatePage(1);
                    break;
                case '+':
                case '=':
                    this.adjustZoom(0.25);
                    break;
                case '-':
                    this.adjustZoom(-0.25);
                    break;
            }
        });
    },

    async loadPdf(file) {
        this.file = file;
        this.elements.previewSection?.classList.remove('hidden');
        this.elements.thumbnailsContainer.innerHTML = '';

        try {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            this.totalPages = this.pdfDoc.numPages;

            await this.generateThumbnails();
        } catch (error) {
            console.error('Error loading PDF for preview:', error);
            this.elements.previewSection?.classList.add('hidden');
        }
    },

    async generateThumbnails() {
        const batchSize = 5;

        for (let i = 1; i <= this.totalPages; i += batchSize) {
            const promises = [];
            for (let j = i; j < i + batchSize && j <= this.totalPages; j++) {
                promises.push(this.createThumbnail(j));
            }
            await Promise.all(promises);
        }
    },

    async createThumbnail(pageNum) {
        const thumbnailDiv = document.createElement('div');
        thumbnailDiv.className = 'page-thumbnail';
        thumbnailDiv.setAttribute('data-page', pageNum);
        thumbnailDiv.draggable = true; // Enable dragging

        // Add loading indicator
        const loading = document.createElement('div');
        loading.className = 'page-thumbnail-loading';
        thumbnailDiv.appendChild(loading);

        // Add page number
        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-thumbnail-number';
        pageLabel.textContent = `Page ${pageNum}`;
        thumbnailDiv.appendChild(pageLabel);

        // Add selection checkbox
        const checkbox = document.createElement('div');
        checkbox.className = 'page-thumbnail-checkbox';
        checkbox.innerHTML = '✓';
        thumbnailDiv.appendChild(checkbox);

        // Click to toggle selection, double-click to open preview
        thumbnailDiv.addEventListener('click', (e) => {
            // Don't toggle if dragging
            if (thumbnailDiv.classList.contains('dragging')) return;
            e.preventDefault();
            this.togglePageSelection(pageNum, thumbnailDiv);
        });

        thumbnailDiv.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.openModal(pageNum);
        });

        // Add drag listeners
        this.addDragListeners(thumbnailDiv);

        this.elements.thumbnailsContainer.appendChild(thumbnailDiv);

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const scale = 0.3;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Remove loading indicator and add canvas
            loading.remove();
            thumbnailDiv.insertBefore(canvas, pageLabel);
        } catch (error) {
            console.error(`Error rendering thumbnail for page ${pageNum}:`, error);
            loading.remove();
        }
    },

    addDragListeners(element) {
        element.addEventListener('dragstart', (e) => {
            element.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', element.getAttribute('data-page'));
            // Small delay to ensure the drag image is created before we hide the element (if we wanted to)
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('dragging');
            this.elements.thumbnailsContainer.querySelectorAll('.page-thumbnail').forEach(el => {
                el.classList.remove('drag-over-left');
                el.classList.remove('drag-over-right');
            });
            this.updatePagesInput();
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const rect = element.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;

            this.elements.thumbnailsContainer.querySelectorAll('.page-thumbnail').forEach(el => {
                if (el !== element) {
                    el.classList.remove('drag-over-left');
                    el.classList.remove('drag-over-right');
                }
            });

            if (e.clientX < midX) {
                element.classList.add('drag-over-left');
                element.classList.remove('drag-over-right');
            } else {
                element.classList.remove('drag-over-left');
                element.classList.add('drag-over-right');
            }
        });

        element.addEventListener('dragleave', () => {
            element.classList.remove('drag-over-left');
            element.classList.remove('drag-over-right');
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggingPageNum = e.dataTransfer.getData('text/plain');
            const draggingElement = this.elements.thumbnailsContainer.querySelector(`.page-thumbnail[data-page="${draggingPageNum}"]`);

            if (draggingElement && draggingElement !== element) {
                const rect = element.getBoundingClientRect();
                const midX = rect.left + rect.width / 2;

                if (e.clientX < midX) {
                    this.elements.thumbnailsContainer.insertBefore(draggingElement, element);
                } else {
                    this.elements.thumbnailsContainer.insertBefore(draggingElement, element.nextSibling);
                }
                this.updatePagesInput();
            }

            element.classList.remove('drag-over-left');
            element.classList.remove('drag-over-right');
        });
    },

    togglePageSelection(pageNum, thumbnailDiv) {
        if (this.selectedPages.has(pageNum)) {
            this.selectedPages.delete(pageNum);
            thumbnailDiv.classList.remove('selected');
        } else {
            this.selectedPages.add(pageNum);
            thumbnailDiv.classList.add('selected');
        }
        this.updatePagesInput();
        if (this.onSelectionChange) {
            this.onSelectionChange(this.getSelectedPagesArray());
        }
    },

    getSelectedPagesArray() {
        // Get pages in visual order from DOM
        const thumbnails = Array.from(this.elements.thumbnailsContainer.querySelectorAll('.page-thumbnail'));
        const selected = [];

        thumbnails.forEach(thumb => {
            const pageNum = parseInt(thumb.getAttribute('data-page'));
            if (this.selectedPages.has(pageNum)) {
                selected.push(pageNum);
            }
        });

        return selected;
    },

    updatePagesInput() {
        const pagesInput = document.getElementById('pages');
        if (pagesInput) {
            const selectedArray = this.getSelectedPagesArray();
            pagesInput.value = this.formatPageRanges(selectedArray);
        }
    },

    formatPageRanges(pages) {
        if (pages.length === 0) return '';
        
        const ranges = [];
        let start = pages[0];
        let end = pages[0];

        for (let i = 1; i < pages.length; i++) {
            if (pages[i] === end + 1) {
                end = pages[i];
            } else {
                ranges.push(start === end ? `${start}` : `${start}-${end}`);
                start = pages[i];
                end = pages[i];
            }
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        
        return ranges.join(',');
    },

    selectAll() {
        const thumbnails = this.elements.thumbnailsContainer?.querySelectorAll('.page-thumbnail');
        thumbnails?.forEach((thumb, index) => {
            const pageNum = index + 1;
            this.selectedPages.add(pageNum);
            thumb.classList.add('selected');
        });
        this.updatePagesInput();
    },

    deselectAll() {
        const thumbnails = this.elements.thumbnailsContainer?.querySelectorAll('.page-thumbnail');
        thumbnails?.forEach(thumb => thumb.classList.remove('selected'));
        this.selectedPages.clear();
        this.updatePagesInput();
    },

    async openModal(pageNum) {
        this.currentPage = pageNum;
        this.zoomLevel = 1;
        this.elements.modal?.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        await this.renderPreview();
        this.updateNavigationButtons();
        this.updateZoomDisplay();
    },

    closeModal() {
        this.elements.modal?.classList.add('hidden');
        document.body.style.overflow = '';
    },

    async navigatePage(direction) {
        const newPage = this.currentPage + direction;
        if (newPage >= 1 && newPage <= this.totalPages) {
            this.currentPage = newPage;
            await this.renderPreview();
            this.updateNavigationButtons();
        }
    },

    updateNavigationButtons() {
        if (this.elements.prevBtn) {
            this.elements.prevBtn.disabled = this.currentPage <= 1;
        }
        if (this.elements.nextBtn) {
            this.elements.nextBtn.disabled = this.currentPage >= this.totalPages;
        }
    },

    adjustZoom(delta) {
        const newZoom = Math.max(0.5, Math.min(3, this.zoomLevel + delta));
        if (newZoom !== this.zoomLevel) {
            this.zoomLevel = newZoom;
            this.renderPreview();
            this.updateZoomDisplay();
        }
    },

    updateZoomDisplay() {
        if (this.elements.zoomLevel) {
            this.elements.zoomLevel.textContent = `${Math.round(this.zoomLevel * 100)}%`;
        }
    },

    async renderPreview() {
        if (!this.pdfDoc || !this.elements.previewCanvas) return;

        try {
            const page = await this.pdfDoc.getPage(this.currentPage);
            const scale = 1.5 * this.zoomLevel;
            const viewport = page.getViewport({ scale });

            const canvas = this.elements.previewCanvas;
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            if (this.elements.pageInfo) {
                this.elements.pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
            }
        } catch (error) {
            console.error('Error rendering preview:', error);
        }
    },

    reset() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.zoomLevel = 1;
        this.file = null;
        this.selectedPages.clear();
        this.elements.previewSection?.classList.add('hidden');
        this.elements.thumbnailsContainer.innerHTML = '';
    }
};

/**
 * Merge multiple PDF files into one
 * @param {File[]} files - Array of PDF files to merge
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Uint8Array>} Merged PDF bytes
 */
async function mergePDFs(files, onProgress = () => { }) {
    const mergedPdf = await PDFLib.PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        onProgress(Math.round((i / files.length) * 80), `Processing ${file.name}...`);

        const arrayBuffer = await readFileAsArrayBuffer(file);
        const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());

        copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    onProgress(90, 'Optimizing merged PDF...');

    // Save with optimization options
    const mergedPdfBytes = await mergedPdf.save({
        useObjectStreams: true,
        addDefaultPage: false
    });

    onProgress(100, 'Complete!');
    return mergedPdfBytes;
}

/**
 * Extract specific pages from a PDF
 * Optimized to copy all pages at once and use object streams to reduce file size
 * @param {File} file - The source PDF file
 * @param {number[]} pageRanges - Array of 1-based page numbers
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Uint8Array>} Extracted PDF bytes
 */
async function extractPages(file, pageRanges, onProgress = () => { }) {
    onProgress(10, 'Loading PDF...');

    const arrayBuffer = await readFileAsArrayBuffer(file);
    const sourcePdf = await PDFLib.PDFDocument.load(arrayBuffer, {
        ignoreEncryption: true
    });

    const extractedPdf = await PDFLib.PDFDocument.create();

    // Convert from 1-based page numbers to 0-based indices
    const pageIndices = pageRanges
        .map(pageNum => pageNum - 1)
        .filter(idx => idx >= 0 && idx < sourcePdf.getPageCount());

    onProgress(30, 'Copying pages...');

    // Copy all pages at once - this helps share resources better
    const copiedPages = await extractedPdf.copyPages(sourcePdf, pageIndices);

    for (const page of copiedPages) {
        extractedPdf.addPage(page);
    }

    onProgress(70, 'Optimizing PDF...');

    // Save with optimization options to reduce file size
    const extractedPdfBytes = await extractedPdf.save({
        useObjectStreams: true,      // Compress object data into streams
        addDefaultPage: false,
        objectsPerTick: 50           // Process in smaller batches
    });

    onProgress(100, 'Complete!');
    return extractedPdfBytes;
}

/**
 * Extract all pages as individual PDFs
 * @param {File} file - The source PDF file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Uint8Array[]>} Array of PDF bytes for each page
 */
async function extractAllPages(file, onProgress = () => { }) {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const sourcePdf = await PDFLib.PDFDocument.load(arrayBuffer, {
        ignoreEncryption: true
    });
    const pageCount = sourcePdf.getPageCount();
    const result = [];

    for (let i = 0; i < pageCount; i++) {
        onProgress(Math.round((i / pageCount) * 90), `Extracting page ${i + 1} of ${pageCount}...`);

        const extractedPdf = await PDFLib.PDFDocument.create();
        const [copiedPage] = await extractedPdf.copyPages(sourcePdf, [i]);
        extractedPdf.addPage(copiedPage);

        const pdfBytes = await extractedPdf.save({
            useObjectStreams: true,
            addDefaultPage: false
        });
        result.push(pdfBytes);
    }

    onProgress(100, 'Complete!');
    return result;
}

/**
 * Create a ZIP file containing multiple PDFs
 * @param {Uint8Array[]} pdfByteArrays - Array of PDF byte arrays
 * @returns {Promise<Blob>} ZIP blob
 */
async function createZipWithPDFs(pdfByteArrays) {
    if (!window.JSZip) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }

    const zip = new JSZip();

    pdfByteArrays.forEach((pdfBytes, index) => {
        zip.file(`page_${String(index + 1).padStart(3, '0')}.pdf`, pdfBytes);
    });

    return zip.generateAsync({ type: 'blob' });
}

/**
 * Parse page ranges from a string like "1,3,5-7"
 * @param {string} text - The page range string
 * @param {number} totalPages - Total pages in the document
 * @returns {number[]} Array of valid page numbers
 */
function parsePageRanges(text, totalPages) {
    // Use an array to preserve order and allow duplicates if entered manually
    const pageNumbers = [];
    const parts = text.split(',');

    for (const part of parts) {
        const trimmedPart = part.trim();

        if (trimmedPart.includes('-')) {
            const [start, end] = trimmedPart.split('-').map(num => parseInt(num.trim(), 10));
            if (!isNaN(start) && !isNaN(end) && start >= 1 && start <= end) {
                for (let i = start; i <= Math.min(end, totalPages); i++) {
                    // Only add if not already in the list (if we want to avoid duplicates like the Set did)
                    // But for reordering, we might want to allow "1,1" if user typed it?
                    // The previous implementation used Set, so it deduped.
                    // Let's stick to deduping but preserving order of first appearance?
                    // Or just allow duplicates?
                    // If I use Set, "1, 2, 1" becomes "1, 2".
                    // If I use Array, "1, 2, 1" becomes "1, 2, 1".
                    // Given the UI is checkbox based, duplicates aren't generated by the UI.
                    // But manual input might.
                    // Let's use Set to be safe and consistent with previous behavior, just remove sort.
                    // Actually, let's use Array and filter unique at the end if we want to match Set behavior but keep order?
                    // No, Set preserves insertion order.
                    // So "1, 2, 1" -> Set adds 1, adds 2, ignores 1. Result: 1, 2.
                    // If user wanted 1, 2, 1, they lose the last 1.
                    // If I change to Array, they get 1, 2, 1.
                    // This seems better for a "Split/Extract" tool - maybe you want to extract page 1 twice?
                    // But the UI checkboxes don't support it.
                    // Let's stick to Set to minimize side effects, but remove sort.
                    pageNumbers.push(i);
                }
            }
        } else {
            const pageNum = parseInt(trimmedPart, 10);
            if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
                pageNumbers.push(pageNum);
            }
        }
    }

    // Remove duplicates while preserving order
    return [...new Set(pageNumbers)];
}

// =========================================
// UI Controllers
// =========================================

/**
 * Initialize merge PDF functionality
 */
function initMergeController() {
    const fileInput = document.getElementById('mergeFileInput');
    if (!fileInput) return;

    const uploadContainer = document.getElementById('mergeUploadContainer');
    const selectedFilesContainer = document.getElementById('mergeSelectedFiles');
    const submitBtn = document.getElementById('mergeSubmitBtn');
    const errorMessage = document.getElementById('mergeErrorMessage');

    let selectedFiles = [];

    fileInput.addEventListener('change', () => {
        const newFiles = Array.from(fileInput.files).filter(f => f.type === 'application/pdf');
        selectedFiles = [...selectedFiles, ...newFiles];
        fileInput.value = '';
        updateUI();
    });

    setupDragAndDrop(
        uploadContainer,
        (files) => {
            selectedFiles = [...selectedFiles, ...files];
            updateUI();
        },
        (msg) => showErrorMessage(errorMessage, msg)
    );

    submitBtn.addEventListener('click', async () => {
        if (selectedFiles.length < 2) {
            showErrorMessage(errorMessage, 'Please select at least two PDF files to merge.');
            return;
        }

        LoadingOverlay.show('Merging PDFs...');

        try {
            const mergedPdfBytes = await mergePDFs(selectedFiles, (percent, text) => {
                LoadingOverlay.updateProgress(percent, text);
            });

            download(mergedPdfBytes, 'merged.pdf', 'application/pdf');
            errorMessage.textContent = '';
        } catch (error) {
            console.error('Merge error:', error);
            showErrorMessage(errorMessage, `Error merging PDFs: ${error.message}`);
        } finally {
            LoadingOverlay.hide();
        }
    });

    function updateUI() {
        selectedFilesContainer.innerHTML = '';

        if (selectedFiles.length > 0) {
            selectedFilesContainer.classList.remove('hidden');

            selectedFiles.forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.draggable = true; // Enable dragging
                fileItem.dataset.index = index;

                // Add reorder buttons
                const isFirst = index === 0;
                const isLast = index === selectedFiles.length - 1;

                fileItem.innerHTML = `
                    <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
                    <div class="file-order-controls">
                        <button class="order-btn up" type="button" ${isFirst ? 'disabled' : ''} aria-label="Move up">▲</button>
                        <button class="order-btn down" type="button" ${isLast ? 'disabled' : ''} aria-label="Move down">▼</button>
                    </div>
                    <div class="file-info">
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${formatFileSize(file.size)}</span>
                    </div>
                    <button class="remove-file" type="button" aria-label="Remove ${file.name}">✕</button>
                `;

                // Event listeners for reordering buttons
                fileItem.querySelector('.order-btn.up').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (index > 0) {
                        [selectedFiles[index - 1], selectedFiles[index]] = [selectedFiles[index], selectedFiles[index - 1]];
                        updateUI();
                    }
                });

                fileItem.querySelector('.order-btn.down').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (index < selectedFiles.length - 1) {
                        [selectedFiles[index + 1], selectedFiles[index]] = [selectedFiles[index], selectedFiles[index + 1]];
                        updateUI();
                    }
                });

                fileItem.querySelector('.remove-file').addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedFiles.splice(index, 1);
                    updateUI();
                });

                // Drag and Drop Events
                fileItem.addEventListener('dragstart', (e) => {
                    fileItem.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index);
                    // Create a custom drag image if needed, or let browser handle it
                });

                fileItem.addEventListener('dragend', () => {
                    fileItem.classList.remove('dragging');
                    document.querySelectorAll('.file-item').forEach(item => {
                        item.classList.remove('drag-over-top');
                        item.classList.remove('drag-over-bottom');
                    });
                });

                fileItem.addEventListener('dragover', (e) => {
                    e.preventDefault(); // Allow dropping
                    e.dataTransfer.dropEffect = 'move';

                    const rect = fileItem.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;

                    // Remove classes from other items
                    document.querySelectorAll('.file-item').forEach(item => {
                        if (item !== fileItem) {
                            item.classList.remove('drag-over-top');
                            item.classList.remove('drag-over-bottom');
                        }
                    });

                    if (e.clientY < midY) {
                        fileItem.classList.add('drag-over-top');
                        fileItem.classList.remove('drag-over-bottom');
                    } else {
                        fileItem.classList.remove('drag-over-top');
                        fileItem.classList.add('drag-over-bottom');
                    }
                });

                fileItem.addEventListener('dragleave', () => {
                    fileItem.classList.remove('drag-over-top');
                    fileItem.classList.remove('drag-over-bottom');
                });

                fileItem.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    let toIndex = index;

                    const rect = fileItem.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;

                    // If dropped on the bottom half, insert after
                    if (e.clientY >= midY) {
                        toIndex++;
                    }

                    // Adjust index if moving downwards because removal shifts indices
                    if (fromIndex < toIndex) {
                        toIndex--;
                    }

                    if (fromIndex !== toIndex && !isNaN(fromIndex)) {
                        const itemToMove = selectedFiles[fromIndex];
                        selectedFiles.splice(fromIndex, 1);
                        selectedFiles.splice(toIndex, 0, itemToMove);
                        updateUI();
                    }
                });

                selectedFilesContainer.appendChild(fileItem);
            });
        } else {
            selectedFilesContainer.classList.add('hidden');
        }

        submitBtn.disabled = selectedFiles.length < 2;
    }
}

/**
function initSplitController() {
    const fileInput = document.getElementById('splitFileInput');
    if (!fileInput) return;

    const uploadContainer = document.getElementById('splitUploadContainer');
    const fileInput = document.getElementById('splitFileInput');
    const uploadContainer = document.getElementById('splitUploadContainer');
    const selectedFileContainer = document.getElementById('splitSelectedFile');
    const submitBtn = document.getElementById('splitSubmitBtn');
    const pageOptionsContainer = document.getElementById('pageOptionsContainer');
    const pdfInfoContainer = document.getElementById('pdfInfo');
    const totalPagesSpan = document.getElementById('totalPages');
    const pagesInput = document.getElementById('pages');
    const extractAllInput = document.getElementById('extractAll');
    const customRangeOption = document.getElementById('customRangeOption');
    const allPagesOption = document.getElementById('allPagesOption');
    const errorMessage = document.getElementById('splitErrorMessage');

    let selectedFile = null;
    let totalPages = 0;

    fileInput.addEventListener('change', handleFileSelection);

    setupDragAndDrop(
        uploadContainer,
        async (files) => {
            if (files.length > 0) {
                selectedFile = files[0];
                await processSelectedFile();
            }
        },
        (msg) => showErrorMessage(errorMessage, msg)
    );

    customRangeOption.addEventListener('click', () => {
        customRangeOption.classList.add('active');
        allPagesOption.classList.remove('active');
        extractAllInput.value = 'false';
        pagesInput.disabled = false;
    });

    allPagesOption.addEventListener('click', () => {
        allPagesOption.classList.add('active');
        customRangeOption.classList.remove('active');
        extractAllInput.value = 'true';
        pagesInput.disabled = true;
    });

    submitBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            showErrorMessage(errorMessage, 'Please select a PDF file to split.');
            return;
        }

        LoadingOverlay.show('Splitting PDF...');

        try {
            const extractAll = extractAllInput.value === 'true';

            if (extractAll) {
                const pdfBytes = await extractAllPages(selectedFile, (percent, text) => {
                    LoadingOverlay.updateProgress(percent, text);
                });

                if (pdfBytes.length > 1) {
                    LoadingOverlay.updateProgress(95, 'Creating ZIP file...');
                    const zipBlob = await createZipWithPDFs(pdfBytes);
                    download(zipBlob, 'extracted_pages.zip', 'application/zip');
                } else if (pdfBytes.length === 1) {
                    download(pdfBytes[0], 'extracted_page.pdf', 'application/pdf');
                }
            } else {
                const pagesText = pagesInput.value.trim();
                if (!pagesText) {
                    LoadingOverlay.hide();
                    showErrorMessage(errorMessage, 'Please enter page numbers or ranges.');
                    return;
                }

                const pageRanges = parsePageRanges(pagesText, totalPages);
                if (pageRanges.length === 0) {
                    LoadingOverlay.hide();
                    showErrorMessage(errorMessage, 'No valid page numbers specified.');
                    return;
                }

                const extractedPdfBytes = await extractPages(selectedFile, pageRanges, (percent, text) => {
                    LoadingOverlay.updateProgress(percent, text);
                });

                download(extractedPdfBytes, 'extracted_pages.pdf', 'application/pdf');
            }

            errorMessage.textContent = '';
        } catch (error) {
            console.error('Split error:', error);
            showErrorMessage(errorMessage, `Error splitting PDF: ${error.message}`);
        } finally {
            LoadingOverlay.hide();
        }
    });

    async function handleFileSelection() {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.type === 'application/pdf') {
                selectedFile = file;
                await processSelectedFile();
            } else {
                showErrorMessage(errorMessage, 'Only PDF files are allowed.');
                resetUI();
            }
        }
    }

    async function processSelectedFile() {
        updateFileUI();
        submitBtn.disabled = false;
        pageOptionsContainer.classList.remove('hidden');

        try {
            totalPages = await getPdfPageCount(selectedFile);
            totalPagesSpan.textContent = totalPages;
            pdfInfoContainer.classList.remove('hidden');
            
            // Load page previews
            await PagePreview.loadPdf(selectedFile);
        } catch (error) {
            console.error('Error reading PDF:', error);
            showErrorMessage(errorMessage, `Error reading PDF: ${error.message}`);
            totalPages = 0;
            totalPagesSpan.textContent = 'Unknown';
            pdfInfoContainer.classList.remove('hidden');
        }
    }

    function updateFileUI() {
        selectedFileContainer.innerHTML = '';

        if (selectedFile) {
            selectedFileContainer.classList.remove('hidden');

            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <span class="file-name">${selectedFile.name}</span>
                    <span class="file-size">${formatFileSize(selectedFile.size)}</span>
                </div>
                <button class="remove-file" type="button" aria-label="Remove file">✕</button>
            `;

            fileItem.querySelector('.remove-file').addEventListener('click', () => {
                selectedFile = null;
                fileInput.value = '';
                resetUI();
            });

            selectedFileContainer.appendChild(fileItem);
        } else {
            selectedFileContainer.classList.add('hidden');
        }
    }

    function resetUI() {
        selectedFile = null;
        totalPages = 0;
        updateFileUI();
        submitBtn.disabled = true;
        pageOptionsContainer.classList.add('hidden');
        pdfInfoContainer.classList.add('hidden');
        errorMessage.textContent = '';
        PagePreview.reset();
    }
}

/**
 * Initialize navigation
 */
function initNavigation() {
    const navbarToggle = document.getElementById('navbarToggle');
    const navbarMenu = document.getElementById('navbarMenu');

    navbarToggle?.addEventListener('click', () => {
        navbarMenu?.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!navbarToggle?.contains(e.target) && !navbarMenu?.contains(e.target)) {
            navbarMenu?.classList.remove('active');
        }
    });
}

/**
 * Initialize tabs
 */
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab));
        tab.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchTab(tab);
            }
        });
    });

    function switchTab(tab) {
        const tabId = tab.getAttribute('data-tab');

        tabs.forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        tabContents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        document.getElementById(`${tabId}-tab`)?.classList.add('active');
    }
}

// =========================================
// Particle Animation
// =========================================

function initParticles() {
    // Create particle effect
    const particlesContainer = document.getElementById('particles-container');
    if (!particlesContainer) {
        console.log('Particles container not found');
        return;
    }
    
    console.log('Initializing particles...');

    const particleCount = 80;

    // Create particles
    for (let i = 0; i < particleCount; i++) {
        createParticle(i);
    }

    function createParticle(index) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        // Random size (small)
        const size = Math.random() * 4 + 2;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;

        // Random position
        const posX = Math.random() * 100;
        const posY = Math.random() * 100;
        particle.style.left = `${posX}%`;
        particle.style.top = `${posY}%`;
        
        // Start visible immediately with staggered timing
        const initialDelay = (index / particleCount) * 2000; // Stagger over 2 seconds
        setTimeout(() => {
            particle.style.opacity = (Math.random() * 0.5 + 0.3).toString();
        }, initialDelay);

        particlesContainer.appendChild(particle);

        // Animate
        animateParticle(particle, posX, posY, initialDelay);
    }

    function animateParticle(particle, startX, startY, initialDelay) {
        // Random animation properties
        const duration = Math.random() * 10 + 10;

        setTimeout(() => {
            particle.style.transition = `all ${duration}s linear`;
            
            // Move in a slight direction
            const moveX = startX + (Math.random() * 20 - 10);
            const moveY = startY - Math.random() * 30; // Move upwards

            particle.style.left = `${moveX}%`;
            particle.style.top = `${moveY}%`;

            // Reset after animation completes
            setTimeout(() => {
                // Reset position
                const newX = Math.random() * 100;
                const newY = Math.random() * 100 + 20; // Start lower
                particle.style.transition = 'none';
                particle.style.left = `${newX}%`;
                particle.style.top = `${newY}%`;
                particle.style.opacity = '0';
                
                // Small delay then animate again
                setTimeout(() => {
                    particle.style.opacity = (Math.random() * 0.5 + 0.3).toString();
                    animateParticle(particle, newX, newY, 0);
                }, 100);
            }, duration * 1000);
        }, initialDelay);
    }

    // Mouse interaction
    document.addEventListener('mousemove', (e) => {
        // Create particles at mouse position
        const mouseX = (e.clientX / window.innerWidth) * 100;
        const mouseY = (e.clientY / window.innerHeight) * 100;

        // Create temporary particle
        const particle = document.createElement('div');
        particle.className = 'particle';

        // Small size
        const size = Math.random() * 4 + 2;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;

        // Position at mouse
        particle.style.left = `${mouseX}%`;
        particle.style.top = `${mouseY}%`;
        particle.style.opacity = '0.6';

        particlesContainer.appendChild(particle);

        // Animate outward
        setTimeout(() => {
            particle.style.transition = 'all 2s ease-out';
            particle.style.left = `${mouseX + (Math.random() * 10 - 5)}%`;
            particle.style.top = `${mouseY + (Math.random() * 10 - 5)}%`;
            particle.style.opacity = '0';

            // Remove after animation
            setTimeout(() => {
                particle.remove();
            }, 2000);
        }, 10);

        // Subtle movement of gradient spheres
        const spheres = document.querySelectorAll('.gradient-sphere');
        const moveX = (e.clientX / window.innerWidth - 0.5) * 5;
        const moveY = (e.clientY / window.innerHeight - 0.5) * 5;

        spheres.forEach(sphere => {
            // Note: We are not using the currentTransform to avoid complexity, 
            // but this might override the CSS float animation. 
            // For better results, we could use CSS variables or a wrapper.
            // However, to strictly follow the requested code:
            sphere.style.transform = `translate(${moveX}px, ${moveY}px)`;
        });
    });
}

// =========================================
// Application Initialization
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize particles first (independent of other modules)
    initParticles();
    
    LoadingOverlay.init();
    PagePreview.init();
    initNavigation();
    initTabs();
    initMergeController();
    initSplitController();

    const container = document.querySelector('.container');
    container?.classList.add('fade-in');
});