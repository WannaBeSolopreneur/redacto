/**
 * The one magic moment: a quick burst of four-point stars around an element, e.g. as a
 * name turns into [PERSON_1]. Web Animations only, no CSS; nothing happens with reduced motion.
 */
const COLORS = ['#f5b301', '#e0459f', '#19c3a5', '#6a2fd8'];
const STAR = 'M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z';

export function sparkle(el: Element | null, count = 6) {
  if (!el || typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el.getBoundingClientRect();
  if (!box.width) return;
  for (let i = 0; i < count; i++) {
    const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const size = 7 + Math.random() * 7;
    star.setAttribute('viewBox', '0 0 24 24');
    star.setAttribute('aria-hidden', 'true');
    star.innerHTML = `<path d="${STAR}" fill="${COLORS[i % COLORS.length]}"/>`;
    Object.assign(star.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '60', width: `${size}px`, height: `${size}px`,
      left: `${box.left + box.width * (0.15 + Math.random() * 0.7) - size / 2}px`,
      top: `${box.top + box.height / 2 - size / 2}px`,
    });
    document.body.appendChild(star);
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const dist = 14 + Math.random() * 16;
    star
      .animate(
        [
          { transform: 'translate(0,0) scale(0.2) rotate(0deg)', opacity: 0 },
          { opacity: 1, offset: 0.25 },
          { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(1) rotate(90deg)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
      .finished.finally(() => star.remove());
  }
}
