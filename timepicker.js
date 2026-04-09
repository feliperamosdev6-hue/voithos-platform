(() => {
  const buildList = (start, end) => {
    const list = [];
    for (let i = start; i <= end; i += 1) {
      list.push(String(i).padStart(2, '0'));
    }
    return list;
  };

  const HOURS = buildList(0, 23);
  const MINUTES = buildList(0, 59);

  let activeInput = null;
  let selectedHour = '00';
  let selectedMinute = '00';

  const overlay = document.createElement('div');
  overlay.className = 'timepicker-overlay';
  overlay.hidden = true;

  const picker = document.createElement('div');
  picker.className = 'timepicker';

  const labels = document.createElement('div');
  labels.className = 'timepicker-labels';
  labels.innerHTML = '<span>Hora</span><span>Minuto</span>';

  const colHour = document.createElement('div');
  colHour.className = 'timepicker-column';
  const colMin = document.createElement('div');
  colMin.className = 'timepicker-column';
  const columnsWrap = document.createElement('div');
  columnsWrap.className = 'timepicker-columns';

  const renderItems = (col, list, type) => {
    col.innerHTML = '';
    list.forEach((value) => {
      const item = document.createElement('div');
      item.className = 'timepicker-item';
      item.textContent = value;
      item.dataset.value = value;
      item.dataset.type = type;
      col.appendChild(item);
    });
  };

  renderItems(colHour, HOURS, 'hour');
  renderItems(colMin, MINUTES, 'minute');

  const updateActive = () => {
    colHour.querySelectorAll('.timepicker-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.value === selectedHour);
    });
    colMin.querySelectorAll('.timepicker-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.value === selectedMinute);
    });
  };

  const scrollToSelected = () => {
    const hourEl = colHour.querySelector(`.timepicker-item[data-value="${selectedHour}"]`);
    const minEl = colMin.querySelector(`.timepicker-item[data-value="${selectedMinute}"]`);
    if (hourEl) hourEl.scrollIntoView({ block: 'center' });
    if (minEl) minEl.scrollIntoView({ block: 'center' });
  };

  const applyValue = () => {
    if (!activeInput) return;
    activeInput.value = `${selectedHour}:${selectedMinute}`;
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const parseInput = (value) => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return;
    const h = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, '0');
    const m = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, '0');
    selectedHour = h;
    selectedMinute = m;
  };

  const openPicker = (input) => {
    activeInput = input;
    parseInput(input.value);
    updateActive();
    overlay.hidden = false;

    const rect = input.getBoundingClientRect();
    const pickerWidth = 220;
    const pickerHeight = 260;
    let top = rect.bottom + 6;
    let left = rect.left;
    if (top + pickerHeight > window.innerHeight) {
      top = Math.max(8, rect.top - pickerHeight - 6);
    }
    if (left + pickerWidth > window.innerWidth) {
      left = Math.max(8, window.innerWidth - pickerWidth - 8);
    }
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;

    requestAnimationFrame(scrollToSelected);
  };

  const closePicker = () => {
    overlay.hidden = true;
    activeInput = null;
  };

  overlay.addEventListener('click', () => {
    closePicker();
  });

  picker.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const target = ev.target;
    if (!target.classList.contains('timepicker-item')) return;
    const type = target.dataset.type;
    if (type === 'hour') selectedHour = target.dataset.value;
    if (type === 'minute') selectedMinute = target.dataset.value;
    updateActive();
    applyValue();
  });

  overlay.appendChild(picker);
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(overlay);
    picker.prepend(labels);
    columnsWrap.appendChild(colHour);
    columnsWrap.appendChild(colMin);
    picker.appendChild(columnsWrap);

    document.querySelectorAll('input[data-timepicker="true"]').forEach((input) => {
      input.setAttribute('autocomplete', 'off');
      input.addEventListener('focus', () => openPicker(input));
      input.addEventListener('click', () => openPicker(input));
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closePicker();
    });
  });
})();
