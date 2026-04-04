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

  console.log('Mobile menu script loaded');
  console.log('sidebar found:', !!sidebar);
  console.log('appContainer found:', !!appContainer);

  function initMobileMenu() {
    console.log('initMobileMenu called');
    toggle = document.querySelector('.sidebar-toggle');
    overlay = document.querySelector('.sidebar-overlay');

    console.log('toggle found:', !!toggle);
    console.log('overlay found:', !!overlay);

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

    const existingCloseBtn = document.querySelector('.sidebar-close-btn');
    const closeBtn = existingCloseBtn || document.createElement('button');

    if (!existingCloseBtn) {
      closeBtn.classList.add('sidebar-close-btn');
      closeBtn.setAttribute('aria-label', 'Close navigation menu');
      closeBtn.innerHTML = '&times;';
      closeBtn.type = 'button';

      const header = document.querySelector('.sidebar-header');
      if (header) {
        header.appendChild(closeBtn);
        console.log('Close button created and added to header');
      } else if (sidebar) {
        sidebar.appendChild(closeBtn);
        console.log('Close button created and added to sidebar');
      }
    } else {
      console.log('Existing close button found');
    }

    closeBtn.addEventListener('click', (e) => {
      console.log('Close button clicked');
      e.stopPropagation();
      closeSidebar();
    });
    closeBtn.addEventListener('touchstart', (e) => {
      console.log('Close button touchstart');
      e.preventDefault();
      e.stopPropagation();
      closeSidebar();
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('.sidebar-close-btn')) {
        return;
      }

      if (sidebar && appContainer && appContainer.classList.contains('sidebar-open')) {
        if (!sidebar.contains(e.target) && !toggle.contains(e.target) && !overlay.contains(e.target)) {
          closeSidebar();
        }
      }
    });
  }

  function openSidebar() {
    if (sidebar && window.innerWidth < 768) {
      sidebar.classList.add('mobile-open');
      sidebar.style.transform = 'translateX(0)';
      if (appContainer) {
        appContainer.classList.add('sidebar-open');
      } else {
        document.body.classList.add('sidebar-open');
      }
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
    console.log('closeSidebar called');
    if (sidebar) {
      console.log('Removing mobile-open class and setting transform');
      sidebar.classList.remove('mobile-open');
      sidebar.style.transform = 'translateX(-100%)';
      if (appContainer) {
        console.log('Removing sidebar-open class from appContainer');
        appContainer.classList.remove('sidebar-open');
      } else {
        console.log('Removing sidebar-open class from body');
        document.body.classList.remove('sidebar-open');
      }
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
      console.log('Sidebar close completed');
    } else {
      console.log('Sidebar element not found');
    }
  }

  if (document.readyState === 'loading') {
    console.log('DOM not ready, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', initMobileMenu);
  } else {
    console.log('DOM ready, calling initMobileMenu');
    initMobileMenu();
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth >= 768) {
        closeSidebar();
      }
    }, 250);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.innerWidth < 768 && appContainer.classList.contains('sidebar-open')) {
      closeSidebar();
    }
  });

})();