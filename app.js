// app.js - Full Integrated Version

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- State Variables ---
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let currentLineIndex = 0;
let linesData = [];
let resizeTimeout;

let currentZoom = 1.0; 
let pinchZoomer = null;


// --- Settings State ---
let highlightColor = localStorage.getItem('hlColor') || '#FFEB3B';
let highlightThickness = parseInt(localStorage.getItem('hlThickness')) || 6;


const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');

if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
        if (currentZoom < 3.0) { // Max 3x zoom
            currentZoom += 0.25;
            renderPage(currentPage);
        }
    });
}

if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
        if (currentZoom > 0.5) { // Min 0.5x zoom
            currentZoom -= 0.25;
            renderPage(currentPage);
        }
    });
}
// --- DOM Elements ---
const fileInput = document.getElementById('fileInput');
const pageContainer = document.getElementById('pageContainer');
const pageInfo = document.getElementById('pageInfo');
// Navigation
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
// Header Controls
const fullscreenBtn = document.getElementById('fullscreenBtn');
const themeToggle = document.getElementById('themeToggle');
const settingsBtn = document.getElementById('settingsBtn');
// Settings Panel
const settingsPanel = document.getElementById('settingsPanel');
const colorPicker = document.getElementById('colorPicker');
const thicknessSlider = document.getElementById('thicknessSlider');


const opacitySlider = document.getElementById('opacitySlider');
const opacityValueDisplay = document.getElementById('opacityValue');
let highlightOpacity = parseInt(localStorage.getItem('hlOpacity')) || 35;


if (opacitySlider) {
    opacitySlider.value = highlightOpacity;
    opacityValueDisplay.textContent = `${highlightOpacity}%`;
}

// --- Event Listener ---
if (opacitySlider) {
    opacitySlider.addEventListener('input', (e) => {
        highlightOpacity = parseInt(e.target.value);
        opacityValueDisplay.textContent = `${highlightOpacity}%`;
        localStorage.setItem('hlOpacity', highlightOpacity);
        applyHighlightSettings(); // Update CSS immediately
    });
}
// ==========================================
// 1. Initialization & Event Listeners
// ==========================================

// Load PDF on File Selection
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        loadPDF(arrayBuffer);
    }
});

// Restore Theme from Storage
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
} else {
    themeToggle.textContent = '🌙';
}

// Restore Thickness Slider Value
if (thicknessSlider) {
    thicknessSlider.value = highlightThickness;
}

// Apply Initial Highlight Styles
applyHighlightSettings();


// ==========================================
// 2. Core PDF Functions
// ==========================================

async function loadPDF(data) {
    try {
        const loadingTask = pdfjsLib.getDocument(data);
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;
        
        const saved = loadProgress();
        if (saved && saved.page <= totalPages) {
            currentPage = saved.page;
            currentLineIndex = saved.line || 0;
        } else {
            currentPage = 1;
            currentLineIndex = 0;
        }
        
        updatePageInfo();
        renderPage(currentPage);
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Failed to load PDF.');
    }
}

async function renderPage(pageNum) {
    // Clear previous content
    pageContainer.innerHTML = '';
    linesData = [];
    
    try {
        const page = await pdfDoc.getPage(pageNum);
        
        // 1. Calculate Base Scale (Fit to Width)
        // This ensures 1.0 zoom always perfectly fits the screen width
        const viewportUnscaled = page.getViewport({ scale: 1.0 });
        const containerWidth = pageContainer.clientWidth || (window.innerWidth - 20);
        const fitWidthScale = containerWidth / viewportUnscaled.width;
        
        // 2. Apply Custom Zoom
        // We multiply the "fit width" scale by our zoom factor
        const finalScale = fitWidthScale * currentZoom;
        
        const viewport = page.getViewport({ scale: finalScale });
        const outputScale = window.devicePixelRatio || 1;

        // 3. Create Page Wrapper
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.style.width = `${viewport.width}px`;
        pageDiv.style.height = `${viewport.height}px`;
        pageDiv.style.position = 'relative'; 
        pageContainer.appendChild(pageDiv);

        // 4. Create Canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'pdfCanvas';
        const context = canvas.getContext('2d');

        // Set dimensions for high-DPI screens (sharp text)
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        pageDiv.appendChild(canvas);

        const renderContext = {
            canvasContext: context,
            viewport: viewport,
            transform: [outputScale, 0, 0, outputScale, 0, 0]
        };
        
        await page.render(renderContext).promise;

        // 5. Create Overlay
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.style.width = `${viewport.width}px`;
        overlay.style.height = `${viewport.height}px`;
        pageDiv.appendChild(overlay);

        // 6. Detect Lines
        const textContent = await page.getTextContent();
        detectLines(textContent, viewport, overlay);

        // 7. Add Floating Action Button
        addTapArea();
        
        // 8. Restore Reading Position
        // If we have lines and a saved index, scroll to it
        if (linesData.length > 0) {
            // Safety check: ensure index is within bounds (e.g., if PDF changed)
            if (currentLineIndex >= linesData.length) currentLineIndex = 0;
            
            // Highlight the line without animation first time to prevent jarring jump
            setCurrentLine(currentLineIndex);
        }
        
    } catch (error) {
        console.error("Error rendering page:", error);
    }
    if (pinchZoomer) {
        // If it exists, just update the element reference if needed or reset
        pinchZoomer.reset();
    } else {
        const pageElement = document.querySelector('.page'); // Target the page wrapper
        if (pageElement) {
            pinchZoomer = new PinchZoom(pageElement, {
                onZoomEnd: (newScale) => {
                    // Update global zoom state
                    // We multiply current zoom by the pinch delta
                    // But to keep it simple, we might just re-render
                    
                    // Note: true re-rendering after every pinch can be slow.
                    // For now, let's update the global currentZoom variable
                    // currentZoom = currentZoom * newScale; 
                    // renderPage(currentPage); 
                    
                    // Actually, a better UX is: 
                    // 1. Let CSS handle the smooth zoom (PinchZoom class does this).
                    // 2. Only re-render if the user pauses or releases for a high-quality update.
                    
                    if (Math.abs(newScale - 1) > 0.1) {
                        currentZoom = currentZoom * newScale;
                        // Clamp zoom
                        currentZoom = Math.min(Math.max(currentZoom, 0.5), 4.0);
                        renderPage(currentPage);
                    }
                }
            });
        }
    }
}

// ==========================================
// 3. Line Detection Logic (Updated)
// ==========================================

function detectLines(textContent, viewport, overlay) {
    const items = textContent.items;
    if (items.length === 0) return;

    // Transform Coordinates
    const transformedItems = items.map(item => {
        const x = item.transform[4];
        const y = item.transform[5];
        const w = item.width;
        // Calculate font height
        const h = Math.sqrt(item.transform[2]*item.transform[2] + item.transform[3]*item.transform[3]);

        const pdfRect = [x, y, x + w, y + h];
        const viewRect = viewport.convertToViewportRectangle(pdfRect);
        
        const minX = Math.min(viewRect[0], viewRect[2]);
        const maxX = Math.max(viewRect[0], viewRect[2]);
        const minY = Math.min(viewRect[1], viewRect[3]);
        const maxY = Math.max(viewRect[1], viewRect[3]);

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            str: item.str,
            hasText: item.str.trim().length > 0
        };
    }).filter(i => i.hasText);

    // Sort Items
    transformedItems.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 8) return a.x - b.x;
        return a.y - b.y;
    });

    // Group Lines
    const lines = [];
    let currentLine = [];
    let lastY = -1000;

    transformedItems.forEach(item => {
        if (lastY === -1000 || Math.abs(item.y - lastY) < 12) {
            currentLine.push(item);
        } else {
            if (currentLine.length > 0) lines.push(currentLine);
            currentLine = [item];
        }
        lastY = item.y;
    });
    if (currentLine.length > 0) lines.push(currentLine);

    // Create Hitboxes
    lines.forEach((lineItems, index) => {
        const minX = Math.min(...lineItems.map(i => i.x));
        const maxX = Math.max(...lineItems.map(i => i.x + i.width));
        const minY = Math.min(...lineItems.map(i => i.y));
        const maxY = Math.max(...lineItems.map(i => i.y + i.height));

        const hitbox = document.createElement('div');
        hitbox.className = 'lineHitbox';
        hitbox.dataset.lineIndex = index;

        // --- CUSTOM THICKNESS LOGIC ---
        // We use the slider value to determine padding
        const paddingY = highlightThickness / 2; 
        const paddingX = 8; // Horizontal padding for easier tapping

        hitbox.style.left = `${minX - paddingX}px`;
        hitbox.style.top = `${minY - paddingY}px`;
        hitbox.style.width = `${maxX - minX + (paddingX * 2)}px`;
        
        // Height = Text Height + Custom Padding
        const height = (maxY - minY) + (paddingY * 2);
        hitbox.style.height = `${height}px`;

        const handleTap = (e) => {
            e.preventDefault();
            e.stopPropagation();
            setCurrentLine(index);
        };

        hitbox.addEventListener('click', handleTap);
        hitbox.addEventListener('touchend', handleTap);

        overlay.appendChild(hitbox);

        linesData.push({
            index,
            element: hitbox
        });
    });
}

function setCurrentLine(index) {
    linesData.forEach((line) => {
        if (line.index < index) {
            line.element.classList.add('read');
            line.element.classList.remove('current');
        } else if (line.index === index) {
            line.element.classList.add('current');
            line.element.classList.remove('read');
            line.element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } else {
            line.element.classList.remove('current', 'read');
        }
    });
    currentLineIndex = index;
    saveProgress();
}

// ==========================================
// 4. New Feature Logic
// ==========================================

// --- Dark Mode ---
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// --- Fullscreen ---
fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
});

// --- Settings Panel Toggle ---
settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle('visible');
    
    // Reposition slightly if needed (optional)
    if (settingsPanel.classList.contains('visible')) {
        settingsPanel.style.display = 'block';
        requestAnimationFrame(() => {
            settingsPanel.style.opacity = '1';
            settingsPanel.style.transform = 'translateY(0)';
        });
    } else {
        settingsPanel.style.opacity = '0';
        settingsPanel.style.transform = 'translateY(-10px)';
        setTimeout(() => { settingsPanel.style.display = 'none'; }, 200);
    }
});

// Close Settings when clicking outside
document.addEventListener('click', (e) => {
    if (settingsPanel.classList.contains('visible') && 
        !settingsPanel.contains(e.target) && 
        e.target !== settingsBtn) {
        settingsPanel.classList.remove('visible');
        settingsPanel.style.opacity = '0';
        setTimeout(() => { settingsPanel.style.display = 'none'; }, 200);
    }
});

// --- Color Picker ---
colorPicker.querySelectorAll('.color-dot').forEach(dot => {
    // Set initial selection
    if (dot.dataset.color === highlightColor) {
        dot.classList.add('selected');
    }

    dot.addEventListener('click', () => {
        // UI Update
        colorPicker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        
        // Save & Apply
        highlightColor = dot.dataset.color;
        localStorage.setItem('hlColor', highlightColor);
        applyHighlightSettings();
    });
});

// --- Thickness Slider ---
thicknessSlider.addEventListener('input', (e) => {
    highlightThickness = parseInt(e.target.value);
    localStorage.setItem('hlThickness', highlightThickness);
    
    // Re-render current page to update hitbox sizes immediately
    // Debounce this to avoid lag while sliding
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (pdfDoc) renderPage(currentPage);
    }, 100);
});

// Helper: Apply Highlight Color CSS
function applyHighlightSettings() {
    let styleTag = document.getElementById('dynamic-highlight-styles');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-highlight-styles';
        document.head.appendChild(styleTag);
    }
    
    // Convert Percentage (0-100) to Hex Alpha (00-FF)
    // Math.round(opacity * 2.55) gives 0-255
    // .toString(16) converts to hex
    const alpha = Math.round(highlightOpacity * 2.55).toString(16).padStart(2, '0');
    
    // Inject dynamic CSS
    // Background uses the custom opacity
    // Border remains 100% opacity for visibility
    styleTag.innerHTML = `
        .lineHitbox.current {
            background-color: ${highlightColor}${alpha} !important;
            border-bottom: 2px solid ${highlightColor} !important;
        }
    `;
}

// ==========================================
// 5. Navigation & Utility
// ==========================================

function addTapArea() {
    let tapArea = document.getElementById('tapArea');
    if (tapArea) {
        tapArea.replaceWith(tapArea.cloneNode(true));
        tapArea = document.getElementById('tapArea');
    } else {
        tapArea = document.createElement('div');
        tapArea.id = 'tapArea';
        tapArea.innerHTML = 'Jump to Next Line';
        document.body.appendChild(tapArea);
    }
    const handleJump = (e) => {
        e.preventDefault();
        e.stopPropagation();
        jumpToNextLine();
    };
    tapArea.addEventListener('click', handleJump);
    tapArea.addEventListener('touchend', handleJump);
}

function jumpToNextLine() {
    if (currentLineIndex < linesData.length - 1) {
        setCurrentLine(currentLineIndex + 1);
    } else {
        if (currentPage < totalPages) {
            currentPage++;
            currentLineIndex = 0;
            renderPage(currentPage);
            updatePageInfo();
            saveProgress();
        } else {
            // Visual feedback for end of doc?
            // alert('End of document'); 
        }
    }
}

function updatePageInfo() {
    pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    
    // Update opacity for visual feedback
    prevPageBtn.style.opacity = currentPage <= 1 ? '0.3' : '1';
    nextPageBtn.style.opacity = currentPage >= totalPages ? '0.3' : '1';
}

// Navigation Events
prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        currentLineIndex = 0;
        renderPage(currentPage);
        updatePageInfo();
        saveProgress();
    }
});

nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        currentLineIndex = 0;
        renderPage(currentPage);
        updatePageInfo();
        saveProgress();
    }
});

// Persistence
function saveProgress() {
    if (!pdfDoc) return;
    localStorage.setItem('pdfProgress', JSON.stringify({
        page: currentPage,
        line: currentLineIndex
    }));
}

function loadProgress() {
    const saved = localStorage.getItem('pdfProgress');
    return saved ? JSON.parse(saved) : null;
}

// Resize Handling
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (pdfDoc) renderPage(currentPage);
    }, 200);
});

// PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}
