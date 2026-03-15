const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public', 'pages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Remove cursor script
  content = content.replace('<script src="/js/cursor.js"></script>\n', '');
  content = content.replace('<script src="/js/cursor.js"></script>\r\n', '');
  content = content.replace('<script src="/js/cursor.js"></script>', '');

  if (file !== 'login.html') {
    // Move logout to sidebar
    if (!content.includes('id="sidebar-logout-btn"')) {
      content = content.replace(
        '</nav>',
        '  <a href="javascript:void(0)" id="sidebar-logout-btn" class="nav-item" style="margin-top:auto; color:var(--danger); border-top:1px solid var(--border);">Log Out</a>\n      </nav>'
      );
    }
    
    // Remove header logout
    content = content.replace(/<button\s+id="logout-btn"\s+class="btn\s+btn-outline"\s+style="padding:\s*6px\s*12px;">Logout<\/button>/g, '');

    // Make user profile clickable 
    if (!content.includes('href="/pages/profile.html"')) {
       content = content.replace('<div class="text-right">', '<a href="/pages/profile.html" class="text-right" style="cursor:pointer; display:block; text-decoration:none;">');
       content = content.replace(/<div id="header-user-role" class="role-chip" style="margin-top: 4px;">-<\/div>\s*<\/div>/g, '<div id="header-user-role" class="role-chip" style="margin-top: 4px;">-</div>\n          </a>');
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
});

console.log('HTML files migrated successfully');
