const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public', 'pages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix the broken anchor tag:
  // We have <a href="/pages/profile.html" class="text-right" style="cursor:pointer;">
  // followed by <div id="header-user-name"...>
  // followed by <div id="header-user-role"...>
  // followed by </div> ... that needs to be </a>
  
  if (content.includes('<a href="/pages/profile.html" class="text-right" style="cursor:pointer;">') && !content.includes('</a>\n          </div>\n        </header>')) {
      // Find the specific pattern we want to replace.
      // Easiest is to regex replace the div after the role chip.
      content = content.replace(/<div id="header-user-role" class="role-chip" style="margin-top: 4px;">-<\/div>\s*<\/div>/, '<div id="header-user-role" class="role-chip" style="margin-top: 4px;">-</div>\n          </a>');
  }

  // Also some files might have style="cursor:pointer; display:block; text-decoration:none;" if they were fixed.
  // We can just forcefully fix user-info if it's messed up.
  // Actually, let's just use string replace for the exact problem we have.
  content = content.replace(/<div id="header-user-role" class="role-chip" style="margin-top: 4px;">-<\/div>\s*<\/div>\n\s*<\/div>/, '<div id="header-user-role" class="role-chip" style="margin-top: 4px;">-</div>\n          </a>\n        </div>');

  fs.writeFileSync(filePath, content, 'utf8');
});
