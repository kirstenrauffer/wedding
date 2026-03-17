import { useState, useEffect, useRef } from 'react';
import '../styles/WaveText.scss';

const BUFFER_FOR_ANIMATION_TIME = 2500;
const ANIMATION_DELAY = 500;

export default function WaveText({ text, startAnimationDelay = ANIMATION_DELAY }) {
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef(null);
  const timeoutRef = useRef(null);

  const scheduleNextAnimation = () => {
    const randomDelay = Math.random() * 2000 + 2000; // 2-4 seconds
    timeoutRef.current = setTimeout(() => {
      setIsAnimating(true);
    }, randomDelay);
  };

  useEffect(() => {
    // Delay animation on page load to ensure page is fully rendered
    const loadTimer = setTimeout(() => {
      setIsAnimating(true);
    }, startAnimationDelay);

    return () => {
      clearTimeout(loadTimer);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [startAnimationDelay]);

  useEffect(() => {
    if (isAnimating) {
      // Reset animation after it completes
      const resetTimer = setTimeout(() => {
        setIsAnimating(false);
        scheduleNextAnimation();
      }, BUFFER_FOR_ANIMATION_TIME);
      return () => clearTimeout(resetTimer);
    }
  }, [isAnimating]);

  const handleHover = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsAnimating(true);
  };

  return (
    <span
      ref={containerRef}
      className={`wave-text ${isAnimating ? 'wave-text--animate' : ''}`}
      onMouseEnter={handleHover}
    >
      {text.split('').map((char, index) => (
        char === ' ' ? (
          <span key={index} className="wave-space">&nbsp;</span>
        ) : (
          <span key={index} className="wave-letter" style={{ '--char-index': index }}>
            {char}
          </span>
        )
      ))}
    </span>
  );
}
