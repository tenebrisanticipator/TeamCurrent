function renderSkeletonRows(tbodyId, columnsCount = 5, rowsCount = 10) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  
  tbody.innerHTML = '';
  let html = '';
  
  for (let i = 0; i < rowsCount; i++) {
    html += `<tr>`;
    for (let c = 0; c < columnsCount; c++) {
      html += `<td><div class="skeleton" style="height: 20px; width: ${Math.random() * 40 + 40}%;"></div></td>`;
    }
    html += `</tr>`;
  }
  
  tbody.innerHTML = html;
}

window.renderSkeletonRows = renderSkeletonRows;
