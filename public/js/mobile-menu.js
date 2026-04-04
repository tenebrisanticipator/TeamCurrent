/**
 * Mobile Menu Toggle Handler
 * Manages responsive sidebar for mobile devices
 */

(function() {
  'use strict';

  const sidebar = document.querySelector('.sidebar');
  const appContainer = document.querySelector('.app-container');
  
  // Create and insert toggle button if it doesn't exist
  function initMobileMenu() {
    let toggle = document.querySelector('.sidebar-toggle');
    
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.classList.add('sidebar-toggle');
      toggle.innerHTML = '☰';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Toggle navigation menu');
      document.body.insertBefore(toggle, document.body.firstChild);
    }
    
    // Toggle sidebar on button click
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSidebar();
    });
    
    // Close sidebar when clicking on a nav item
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        // Only close on mobile
        if (window.innerWidth < 768) {
          closeSidebar();
        }
      });
    });

    // Close sidebar when clicking on main content area (mobile only)
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.addEventListener('click', (e) => {
        if (window.innerWidth < 768 && appContainer.classList.contains('sidebar-open')) {
          closeSidebar();
        }
      });
    }
    
    // Close sidebar when clicking outside (on overlay)
    document.addEventListener('click', (e) => {
      if (sidebar && appContainer && appContainer.classList.contains('sidebar-open')) {
        if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
          closeSidebar();
        }
      }
    });

    // Close sidebar when clicking on the overlay itself
    if (appContainer) {
      appContainer.addEventListener('click', (e) => {
        if (appContainer.classList.contains('sidebar-open') && 
            !sidebar.contains(e.target) && 
            !toggle.contains(e.target) &&
            window.innerWidth < 768) {
          closeSidebar();
        }
      });
    }
  }

  function toggleSidebar() {
    if (sidebar) {
      sidebar.classList.toggle('mobile-open');
      appContainer.classList.toggle('sidebar-open');
    }
  }

  function closeSidebar() {
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      sidebar.classList.remove('mobile-open');
      appContainer.classList.remove('sidebar-open');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
  } else {
    initMobileMenu();
  }

  // Handle window resize to close sidebar on desktop
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth >= 768) {
        closeSidebar();
      }
    }, 250);
  });
  // Close sidebar on Escape key press (mobile only)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.innerWidth < 768 && appContainer.classList.contains('sidebar-open')) {
      closeSidebar();
    }
  });})();
