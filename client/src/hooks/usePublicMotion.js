import { useEffect, useRef } from 'react';
import '../components/PublicMotion.css';

const targets = [
  '.public-hero-copy',
  '.hospital-hero-visual',
  '.hospital-page-heading',
  '.public-section-heading',
  '.hospital-reception-visual',
  '.hospital-about > div',
  '.public-service-card',
  '.hospital-care-card',
  '.hospital-profile-card',
  '.hospital-guide-grid article',
  '.hospital-overview-intro',
  '.hospital-overview-contact',
  '.hospital-visit-detail-grid article',
  '.hospital-location > div',
  '.hospital-location > figure',
  '.hospital-patient-shortcuts > a',
  '.visit-steps > li',
].join(',');

// Progressive enhancement: content is always visible, even without observers or motion.
export function usePublicMotion() {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.IntersectionObserver) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet();
    const animated = new Set();
    let observer, additions;
    const stop = () => {
      observer?.disconnect();
      additions?.disconnect();
      for (const element of animated) element.classList.remove('hospital-reveal-in');
      animated.clear();
    };
    const start = () => {
      stop();
      if (preference.matches) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const { target, isIntersecting } of entries) {
            if (!isIntersecting) continue;
            observer.unobserve(target);
            if (seen.has(target)) continue;
            seen.add(target);
            // Keyboard users should never have to wait for a focused link to settle.
            if (target.contains(document.activeElement)) continue;
            target.classList.add('hospital-reveal-in');
            animated.add(target);
          }
        },
        { threshold: 0, rootMargin: '0px 0px -24px 0px' },
      );
      const register = (node) => {
        if (node.nodeType !== 1) return;
        if (node.matches(targets) && !seen.has(node)) observer.observe(node);
        node.querySelectorAll(targets).forEach((element) => {
          if (!seen.has(element)) observer.observe(element);
        });
      };
      register(root);
      // Doctor results and published hospital information can arrive after the first render.
      additions = new MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach(register));
      });
      additions.observe(root, { childList: true, subtree: true });
    };
    const settleFocus = (event) => {
      if (!event.target.matches(':focus-visible')) return;
      for (const element of animated) {
        if (element.contains(event.target)) element.classList.remove('hospital-reveal-in');
      }
    };
    const finish = (event) => {
      if (event.animationName !== 'hospital-arrive') return;
      event.target.classList.remove('hospital-reveal-in');
      animated.delete(event.target);
    };
    start();
    root.addEventListener('animationend', finish);
    preference.addEventListener('change', start);
    root.addEventListener('focusin', settleFocus);
    return () => {
      stop();
      preference.removeEventListener('change', start);
      root.removeEventListener('focusin', settleFocus);
      root.removeEventListener('animationend', finish);
    };
  }, []);
  return rootRef;
}
