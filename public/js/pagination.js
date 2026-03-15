// Global reusable cursor-based pagination component
function renderPagination(containerId, meta, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const { hasNext, nextCursor, totalCount, pageSize } = meta;
  
  // Manage cursor stack globally for this list context
  if (!window.paginationState) {
    window.paginationState = { stack: [null], currentIndex: 0 };
  }
  
  const state = window.paginationState;
  
  // If nextCursor exists and we haven't pushed it, save it (for next)
  if (hasNext && nextCursor) {
    if (state.stack.length <= state.currentIndex + 1) {
      state.stack.push(nextCursor);
    } else {
      state.stack[state.currentIndex + 1] = nextCursor;
    }
  }

  const startRecord = (state.currentIndex * pageSize) + 1;
  const endRecord = Math.min(startRecord + pageSize - 1, totalCount);
  
  container.innerHTML = `
    <div class="flex justify-between items-center" style="margin-top: 20px;">
      <div style="font-size: 13px; color: var(--text-muted);">
        Showing ${startRecord}-${endRecord} of ~${totalCount || 0}
      </div>
      <div class="flex gap-10">
        <button class="btn btn-outline" id="btn-prev" ${state.currentIndex === 0 ? 'disabled' : ''}>&larr; Prev</button>
        <button class="btn btn-outline" id="btn-next" ${!hasNext ? 'disabled' : ''}>Next &rarr;</button>
      </div>
    </div>
  `;

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        const cursorToUse = state.stack[state.currentIndex];
        onPageChange(cursorToUse);
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (hasNext) {
        state.currentIndex++;
        const cursorToUse = state.stack[state.currentIndex];
        onPageChange(cursorToUse);
      }
    });
  }
}

function resetPagination() {
  window.paginationState = { stack: [null], currentIndex: 0 };
}

window.renderPagination = renderPagination;
window.resetPagination = resetPagination;
