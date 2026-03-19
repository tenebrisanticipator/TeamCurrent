// Immediately hide document body until auth check completes
document.documentElement.style.visibility = 'hidden';

(async function() {
  try {
    const res = await fetch('/api/auth/verify');
    if (!res.ok) {
      window.location.href = '/pages/login.html';
      return;
    }
    const data = await res.json();
    window.currentUser = data.user;
    
    // SECURITY: Provide role-checking functions for page-level access control
    window.checkPageAccess = function(allowedRoles) {
      if (!window.currentUser || !allowedRoles.includes(window.currentUser.role)) {
        window.location.href = '/pages/dashboard.html';
        return false;
      }
      return true;
    };

    window.hasRole = function(role) {
      return window.currentUser && window.currentUser.role === role;
    };

    window.hasAnyRole = function(roles) {
      return window.currentUser && roles.includes(window.currentUser.role);
    };
    
    // Auth complete, show page, trigger entry animations
    document.documentElement.style.visibility = '';
    
    // Populate user info and setup logout
    const setupUI = () => {
      const userNameEl = document.getElementById('header-user-name');
      const userRoleEl = document.getElementById('header-user-role');
      if(userNameEl) userNameEl.textContent = data.user.name;
      if(userRoleEl) userRoleEl.textContent = data.user.role;
      
      // SECURITY: Hide admin-only sidebar items for non-admins (prevents unauthorized access attempts)
      if (data.user.role !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.remove());
      }
      
      // Setup logout
      const logoutBtn = document.getElementById('sidebar-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/pages/login.html';
        });
      }
    };

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', setupUI);
    } else {
      setupUI();
    }

  } catch (error) {
    window.location.href = '/pages/login.html';
  }
})();
