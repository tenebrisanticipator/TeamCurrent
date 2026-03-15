// Detect touch devices
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (!isTouchDevice) {
  // Add cursor elements to body
  const cursorDot = document.createElement('div');
  cursorDot.className = 'cursor-dot';
  const cursorRing = document.createElement('div');
  cursorRing.className = 'cursor-ring';
  
  document.body.appendChild(cursorDot);
  document.body.appendChild(cursorRing);
  
  document.body.style.cursor = 'none';
  
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let ringX = mouseX;
  let ringY = mouseY;
  
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    // Dot moves instantly
    cursorDot.style.transform = `translate(calc(-50% + ${mouseX}px), calc(-50% + ${mouseY}px))`;
  });
  
  // Ring lerps for smooth lag
  const lerp = (a, b, n) => (1 - n) * a + n * b;
  
  function renderCursor() {
    ringX = lerp(ringX, mouseX, 0.2);
    ringY = lerp(ringY, mouseY, 0.2);
    cursorRing.style.transform = `translate(calc(-50% + ${ringX}px), calc(-50% + ${ringY}px))`;
    requestAnimationFrame(renderCursor);
  }
  requestAnimationFrame(renderCursor);
  
  // Interactive element hovering
  function setupHoverEffects() {
    const interactives = document.querySelectorAll('a, button, input, select, .interactive, tr');
    interactives.forEach(el => {
      // Avoid duplicate listeners
      if(el.dataset.cursorBound) return;
      el.dataset.cursorBound = "true";
      
      el.addEventListener('mouseenter', () => {
        if (el.tagName === 'TR') {
          cursorRing.style.width = '120px';
          cursorRing.style.height = '4px';
          cursorRing.style.borderRadius = '2px';
          cursorRing.style.background = 'var(--amber)';
        } else {
          cursorDot.style.transform = `translate(calc(-50% + ${mouseX}px), calc(-50% + ${mouseY}px)) scale(0)`;
          cursorRing.style.width = '48px';
          cursorRing.style.height = '48px';
          cursorRing.style.background = 'rgba(245,166,35,0.2)';
        }
      });
      el.addEventListener('mouseleave', () => {
        cursorDot.style.transform = `translate(calc(-50% + ${mouseX}px), calc(-50% + ${mouseY}px)) scale(1)`;
        cursorRing.style.width = '32px';
        cursorRing.style.height = '32px';
        cursorRing.style.borderRadius = '50%';
        cursorRing.style.background = 'transparent';
      });
    });
  }
  
  window.addEventListener('DOMContentLoaded', setupHoverEffects);
  
  // Run setup again if elements are injected later, using MutationObserver
  const observer = new MutationObserver((mutations) => {
    let shouldSetup = false;
    mutations.forEach(m => {
      if (m.addedNodes.length > 0) shouldSetup = true;
    });
    if (shouldSetup) setupHoverEffects();
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  
  window.addEventListener('mousedown', () => {
    cursorDot.style.transform = `translate(calc(-50% + ${mouseX}px), calc(-50% + ${mouseY}px)) scale(2)`;
    cursorDot.style.boxShadow = '0 0 10px var(--amber)';
    setTimeout(() => {
      cursorDot.style.transform = `translate(calc(-50% + ${mouseX}px), calc(-50% + ${mouseY}px)) scale(1)`;
      cursorDot.style.boxShadow = 'none';
    }, 150);
  });
}
