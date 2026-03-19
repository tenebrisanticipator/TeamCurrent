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
    
    // Auth complete, show page, trigger entry animations
    document.documentElement.style.visibility = '';
    
    // Populate user info and setup logout
    const setupUI = () => {
      const userNameEl = document.getElementById('header-user-name');
      const userRoleEl = document.getElementById('header-user-role');
      if(userNameEl) userNameEl.textContent = data.user.name;
      if(userRoleEl) userRoleEl.textContent = data.user.role;
      
      // Hide admin-only sidebar items for non-admins (SECURITY: prevents unauthorized access)
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
