// pinch-zoom.js
class PinchZoom {
    constructor(element, options = {}) {
        this.element = element;
        this.onZoomEnd = options.onZoomEnd || (() => {});
        
        this.state = {
            scale: 1,
            panning: false,
            pointX: 0,
            pointY: 0,
            startX: 0,
            startY: 0
        };

        this.init();
    }

    init() {
        this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.element.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.element.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }

    handleTouchStart(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            this.startDist = Math.hypot(touch2.pageX - touch1.pageX, touch2.pageY - touch1.pageY);
            this.startScale = this.state.scale;
        } else if (e.touches.length === 1) {
            // Check if we are zoomed in to allow panning
            if (this.state.scale > 1) {
                this.state.panning = true;
                this.state.startX = e.touches[0].pageX - this.state.pointX;
                this.state.startY = e.touches[0].pageY - this.state.pointY;
            }
        }
    }

    handleTouchMove(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            const currentDist = Math.hypot(touch2.pageX - touch1.pageX, touch2.pageY - touch1.pageY);
            const scale = (currentDist / this.startDist) * this.startScale;
            
            // Limit scale (0.5x to 4x)
            this.state.scale = Math.min(Math.max(scale, 0.5), 4);
            
            this.updateTransform();
        } else if (e.touches.length === 1 && this.state.panning) {
            e.preventDefault(); // Stop browser scrolling
            this.state.pointX = e.touches[0].pageX - this.state.startX;
            this.state.pointY = e.touches[0].pageY - this.state.startY;
            this.updateTransform();
        }
    }

    handleTouchEnd(e) {
        if (e.touches.length < 2) {
            // Pinch ended
            if (this.state.scale !== 1) {
               // Optional: Snap back or re-render
               this.onZoomEnd(this.state.scale);
            }
        }
        if (e.touches.length === 0) {
            this.state.panning = false;
        }
    }

    updateTransform() {
        // We only use CSS transform for the visual effect during gesture
        // Real re-rendering happens on end
        this.element.style.transform = `translate(${this.state.pointX}px, ${this.state.pointY}px) scale(${this.state.scale})`;
        this.element.style.transformOrigin = '0 0';
    }
    
    reset() {
        this.state = { scale: 1, panning: false, pointX: 0, pointY: 0, startX: 0, startY: 0 };
        this.element.style.transform = 'none';
    }
}
