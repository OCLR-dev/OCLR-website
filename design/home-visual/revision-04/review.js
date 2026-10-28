'use strict';

const buttons = document.querySelectorAll('[data-view]');
buttons.forEach((button) => {
  button.addEventListener('click', () => {
    buttons.forEach((candidate) => {
      const active = candidate === button;
      candidate.setAttribute('aria-pressed', String(active));
      document.getElementById(candidate.dataset.view).classList.toggle('hidden', !active);
    });
  });
});
