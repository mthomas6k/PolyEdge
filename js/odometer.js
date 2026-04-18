// ==========================================
// ODOMETER - Lock-digit cycling animation
// ==========================================
const Odometer = (() => {
  const DIGIT_HEIGHT = 1; // em units
  const TRANSITION_MS = 600;
  const STAGGER_MS = 50; // delay between digits

  // Create the digit roller HTML for a single character slot
  function createDigitRoller() {
    const col = document.createElement('span');
    col.className = 'odo-col';
    const inner = document.createElement('span');
    inner.className = 'odo-inner';
    // digits 0-9
    for (let i = 0; i <= 9; i++) {
      const d = document.createElement('span');
      d.className = 'odo-digit';
      d.textContent = i;
      inner.appendChild(d);
    }
    col.appendChild(inner);
    return col;
  }

  // Animate a single column to show digit d (0-9)
  function rollTo(col, digit, delay) {
    const inner = col.querySelector('.odo-inner');
    if (!inner) return;
    setTimeout(() => {
      inner.style.transition = `transform ${TRANSITION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      inner.style.transform = `translateY(-${digit * DIGIT_HEIGHT}em)`;
    }, delay);
  }

  // Render an odometer into an element
  // el: target DOM element
  // value: string like "$1,234.56" or "80%"
  function render(el, valueStr) {
    if (!el) return;
    const chars = String(valueStr).split('');
    const currentCols = el.querySelectorAll('.odo-col, .odo-static');

    // Build new set of columns
    const frag = document.createDocumentFragment();
    const colsToAnimate = [];
    let digitIndex = 0;

    chars.forEach((ch) => {
      if (ch >= '0' && ch <= '9') {
        const col = createDigitRoller();
        const d = parseInt(ch, 10);
        // Start at 0 for animation
        const inner = col.querySelector('.odo-inner');
        inner.style.transform = `translateY(0)`;
        frag.appendChild(col);
        colsToAnimate.push({ col, digit: d, index: digitIndex++ });
      } else {
        // Static character (comma, period, $, %, space, etc.)
        const s = document.createElement('span');
        s.className = 'odo-static';
        s.textContent = ch;
        frag.appendChild(s);
      }
    });

    el.innerHTML = '';
    el.classList.add('odo-wrap');
    el.appendChild(frag);

    // Stagger the animations (right to left for number feel)
    const total = colsToAnimate.length;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        colsToAnimate.forEach(({ col, digit, index }) => {
          // Stagger from rightmost digit
          const delay = (total - 1 - index) * STAGGER_MS;
          rollTo(col, digit, delay);
        });
      });
    });
  }

  // Update an existing odometer to a new value (smooth transition)
  function update(el, newValueStr) {
    if (!el) return;
    const newChars = String(newValueStr).split('');
    const existingCols = el.querySelectorAll('.odo-col');
    const existingStatics = el.querySelectorAll('.odo-static');

    let digitIdx = 0;
    let staticIdx = 0;
    let needsFullRender = false;

    // Check if structure matches
    let colCount = 0;
    let sCount = 0;
    newChars.forEach(ch => {
      if (ch >= '0' && ch <= '9') colCount++;
      else sCount++;
    });

    if (colCount !== existingCols.length || sCount !== existingStatics.length) {
      needsFullRender = true;
    }

    if (needsFullRender) {
      render(el, newValueStr);
      return;
    }

    // Update in place
    digitIdx = 0;
    staticIdx = 0;
    newChars.forEach(ch => {
      if (ch >= '0' && ch <= '9') {
        const col = existingCols[digitIdx];
        if (col) {
          const d = parseInt(ch, 10);
          const delay = (existingCols.length - 1 - digitIdx) * STAGGER_MS;
          rollTo(col, d, delay);
        }
        digitIdx++;
      } else {
        const s = existingStatics[staticIdx];
        if (s) s.textContent = ch;
        staticIdx++;
      }
    });
  }

  // Convenience: auto-init all elements with data-odo attribute
  function initAll(selector) {
    document.querySelectorAll(selector || '[data-odo]').forEach(el => {
      const val = el.getAttribute('data-odo') || el.textContent;
      render(el, val);
    });
  }

  return { render, update, initAll };
})();
