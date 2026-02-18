// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let currentPage = 1;
let currentLineIndex = 0;
let linesData = [];
let totalPages = 0;

const fileInput = document.getElementById('fileInput');
const pageContainer = document.getElementById('pageContainer');
const pageInfo = document.getElementById('pageInfo');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');

// Load PDF file
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        loadPDF(arrayBuffer);
    }
});

async function loadPDF(data) {
    try {
        const loadingTask = pdfjsLib.getDocument(data);
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;
        currentPage = 1;
        updatePageInfo();
        renderPage(currentPage);
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Failed to load PDF');
    }
}

async function renderPage(pageNum) {
    pageContainer.innerHTML = '';
    linesData = [];
    currentLineIndex = 0;

    const page = await pdfDoc.getPage(pageNum);
    
    // 1. Calculate scale to fit screen width
    // Get the unscaled viewport first
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    
    // We want the PDF to fit the container width (minus padding)
    const containerWidth = pageContainer.clientWidth || window.innerWidth - 20;
    const scale = containerWidth / unscaledViewport.width;
    
    // 2. Handle High DPI (Retina) screens for sharp text
    const outputScale = window.devicePixelRatio || 1;
    
    // Create the actual viewport for rendering
    const viewport = page.getViewport({ scale: scale });

    // Create page wrapper
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page';
    // Set explicit dimensions to match PDF aspect ratio
    pageDiv.style.width = `${viewport.width}px`;
    pageDiv.style.height = `${viewport.height}px`;
    pageContainer.appendChild(pageDiv);

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'pdfCanvas';
    const context = canvas.getContext('2d');
    
    // Scale canvas internal dimensions by device pixel ratio (sharpness)
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    
    // CSS width/height must match the viewport (logical pixels)
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    pageDiv.appendChild(canvas);

    // Transform context to account for High DPI
    const renderContext = {
        canvasContext: context,
        viewport: viewport,
        transform: outputScale !== 1 
            ? [outputScale, 0, 0, outputScale, 0, 0] 
            : null
    };
    
    await page.render(renderContext).promise;

    // Create overlay for line hitboxes
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    pageDiv.appendChild(overlay);

    // Extract text and detect lines
    const textContent = await page.getTextContent();
    detectLines(textContent, viewport, overlay);

    addTapArea();
    
    // Restore progress if on same page
    const saved = loadProgress();
    if (saved && saved.page === pageNum) {
        setCurrentLine(saved.line);
    }
}


function detectLines(textContent, viewport, overlay) {
    const items = textContent.items;
    if (items.length === 0) return;

    // Group text items into lines based on Y position
    const lineThreshold = 5;
    const lines = [];
    let currentLine = [];
    let lastY = null;

    items.forEach(item => {
        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        const width = item.width;
        const height = item.height;

        if (lastY === null || Math.abs(y - lastY) < lineThreshold) {
            currentLine.push({ x, y, width, height, text: item.str });
        } else {
            if (currentLine.length > 0) {
                lines.push([...currentLine]);
            }
            currentLine = [{ x, y, width, height, text: item.str }];
        }
        lastY = y;
    });

    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    // Sort lines by Y position (top to bottom)
    lines.sort((a, b) => b[0].y - a[0].y);

    // Create hitboxes for each line
    lines.forEach((line, index) => {
        const minX = Math.min(...line.map(item => item.x));
        const maxX = Math.max(...line.map(item => item.x + item.width));
        const minY = Math.min(...line.map(item => item.y));
        const maxY = Math.max(...line.map(item => item.y + item.height));

        const hitbox = document.createElement('div');
        hitbox.className = 'lineHitbox';
        hitbox.dataset.lineIndex = index;

        // Convert PDF coordinates to canvas coordinates
        hitbox.style.left = `${minX}px`;
        hitbox.style.top = `${viewport.height - maxY}px`;
        hitbox.style.width = `${maxX - minX}px`;
        hitbox.style.height = `${maxY - minY}px`;

        hitbox.addEventListener('click', () => {
            setCurrentLine(index);
        });

        overlay.appendChild(hitbox);

        linesData.push({
            index,
            element: hitbox,
            bounds: { minX, maxX, minY, maxY }
        });
    });

    // Highlight first line
    if (lines.length > 0) {
        setCurrentLine(0);
    }
}

function setCurrentLine(index) {
    // Remove current class from all lines
    document.querySelectorAll('.lineHitbox').forEach(box => {
        if (parseInt(box.dataset.lineIndex) < index) {
            box.classList.add('read');
            box.classList.remove('current');
        } else if (parseInt(box.dataset.lineIndex) === index) {
            box.classList.add('current');
            box.classList.remove('read');
        } else {
            box.classList.remove('current', 'read');
        }
    });

    currentLineIndex = index;

    // Scroll to line
    if (linesData[index]) {
        linesData[index].element.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }

    // Save progress
    saveProgress();
}

function addTapArea() {
    let tapArea = document.getElementById('tapArea');
    if (!tapArea) {
        tapArea = document.createElement('div');
        tapArea.id = 'tapArea';
        tapArea.innerHTML = '👆 Tap to jump to next line';
        document.body.appendChild(tapArea);

        tapArea.addEventListener('click', jumpToNextLine);
    }
}

function jumpToNextLine() {
    if (currentLineIndex < linesData.length - 1) {
        setCurrentLine(currentLineIndex + 1);
    } else {
        // Move to next page
        if (currentPage < totalPages) {
            currentPage++;
            renderPage(currentPage);
            updatePageInfo();
        } else {
            alert('End of document');
        }
    }
}

function updatePageInfo() {
    pageInfo.textContent = `Page: ${currentPage} / ${totalPages}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderPage(currentPage);
        updatePageInfo();
    }
});

nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        renderPage(currentPage);
        updatePageInfo();
    }
});

function saveProgress() {
    localStorage.setItem('pdfProgress', JSON.stringify({
        page: currentPage,
        line: currentLineIndex
    }));
}

function loadProgress() {
    const saved = localStorage.getItem('pdfProgress');
    if (saved) {
        const progress = JSON.parse(saved);
        return progress;
    }
    return null;
}
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (pdfDoc) {
            renderPage(currentPage);
        }
    }, 200); // Debounce to prevent rapid re-renders
});
// Register service worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed'));
    });
}
