export function openOverlay(id) {
  document.getElementById(id).classList.add('on');
}

export function closeOverlay(id) {
  document.getElementById(id).classList.remove('on');
}

export function initOverlayCloseOnBackdrop() {
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov) ov.classList.remove('on');
    });
  });
}
