// Implements smooth exit animation on internal links
document.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('click', e => {
    // Check if clicked element or its parent is a link
    let link = e.target.closest('a');
    
    if (link && link.href && link.hostname === window.location.hostname && !link.hasAttribute('target')) {
      e.preventDefault();
      const href = link.href;
      
      // Prevent transition on same page hashes
      if (href.split('#')[0] === window.location.href.split('#')[0]) {
        window.location.href = href;
        return;
      }
      
      document.body.style.transition = 'opacity 0.15s ease';
      document.body.style.opacity = '0';
      setTimeout(() => window.location.href = href, 150);
    }
  });
});
