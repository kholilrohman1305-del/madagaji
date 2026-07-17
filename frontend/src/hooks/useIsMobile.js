import { useEffect, useState } from 'react';

const QUERY = '(max-width: 768px)';

// Deteksi layar mobile mengikuti breakpoint chrome mobile (mb-*) di app.css.
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false
  ));
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}
