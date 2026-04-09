document.addEventListener('DOMContentLoaded', () => {
  const groups = Array.from(document.querySelectorAll('.nav-group'));

  groups.forEach((group) => {
    const toggle = group.querySelector('.nav-group-toggle');
    const list = group.querySelector('.nav-group-list');
    if (!toggle || !list) return;
    if (toggle.disabled) return;

    const shouldOpen = group.classList.contains('active') || list.querySelector('.nav-item.active');
    group.classList.toggle('open', shouldOpen);
    toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');

    toggle.addEventListener('click', () => {
      const isOpen = group.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });
});
