/**
 * Mobile Menu Toggle Handler
 * Manages responsive sidebar for mobile devices
 */

(function() {
  'use strict';

  const sidebar = document.querySelector('.sidebar');
  const appContainer = document.querySelector('.app-container');
  let overlay = null;
  let toggle = null;

  // Create and insert toggle button and overlay if they don't exist
  function initMobileMenu() {
    toggle = document.querySelector('.sidebar-toggle');
    overlay = document.querySelector('.sidebar-overlay');

    if (!toggle) {
      toggle = document.createElement('button');
      toggle.classList.add('sidebar-toggle');
      toggle.innerHTML = '☰';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Toggle navigation menu');
      document.body.insertBefore(toggle, document.body.firstChild);
    }

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.classList.add('sidebar-overlay');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
    }

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSidebar();
    });

    overlay.addEventListener('click', closeSidebar);

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth < 768) {
          closeSidebar();
        }
      });
    });

    const closeBtn = document.createElement('button');
    closeBtn.classList.add('sidebar-close-btn');
    closeBtn.setAttribute('aria-label', 'Close navigation menu');
    closeBtn.innerHTML = '&times;';
    closeBtn.type = 'button';

    const header = document.querySelector('.sidebar-header');
    if (header && !header.querySelector('.sidebar-close-btn')) {
      header.appendChild(closeBtn);
      closeBtn.addEventListener('click', closeSidebar);
    }

    document.addEventListener('click', (e) => {
      if (sidebar && appContainer && appContainer.classList.contains('sidebar-open')) {
        if (!sidebar.contains(e.target) && !toggle.contains(e.target) && !overlay.contains(e.target)) {
          closeSidebar();
        }
      }
    });
  }

  function openSidebar() {
    if (sidebar) {
      sidebar.classList.add('mobile-open');
      appContainer.classList.add('sidebar-open');
      if (overlay) overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function toggleSidebar() {
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function closeSidebar() {
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      sidebar.classList.remove('mobile-open');
      appContainer.classList.remove('sidebar-open');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
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
