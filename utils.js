function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function formatDateIST(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

function formatDateISTOnly(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });
}

// Set up UI interactions
function checkRoleAccess() {
  if (!window.currentUser) return;
  if (window.currentUser.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.remove());
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  checkRoleAccess();
  
  // Inject spotlight background globally if not present
  if (!document.querySelector('.global-spotlight')) {
    const spotlight = document.createElement('div');
    spotlight.className = 'global-spotlight';
    document.body.prepend(spotlight);
  }
});

window.debounce = debounce;
window.formatDateIST = formatDateIST;
window.formatDateISTOnly = formatDateISTOnly;
