import { useRef, useState, useEffect } from 'react';
import '../styles/Slider.scss';

// CONSTANTS: Slider thumb positioning
// ⚠️ MUST MATCH .slider__input::-webkit-slider-thumb width in Slider.scss (line 215)
const THUMB_WIDTH = 12; // px
const THUMB_RADIUS = THUMB_WIDTH / 2;

/**
 * Calculate CSS position for slider-related elements accounting for thumb width.
 * Native range input thumb center is constrained to [thumbRadius, 100% - thumbRadius],
 * not the full [0%, 100%]. This helper corrects positioning to match thumb center.
 *
 * @param {number} value - Current slider value (0 to max)
 * @param {number} max - Maximum slider value (typically 24 for hours)
 * @param {number} adjustment - Optional CSS offset in pixels (default: 0)
 *                              Use negative for left, positive for right
 *                              (e.g., -30 to center a 60px label)
 * @returns {string} CSS calc() expression safe for use in inline styles
 */
const thumbPosition = (value, max, adjustment = 0) => {
  if (value < 0 || value > max) {
    console.warn(`thumbPosition: value ${value} outside range [0, ${max}]`);
  }
  const fraction = value / max;
  const adjustStr = adjustment !== 0
    ? ` ${adjustment > 0 ? '+' : '-'} ${Math.abs(adjustment)}px`
    : '';
  return `calc(${fraction} * (100% - ${THUMB_WIDTH}px) + ${THUMB_RADIUS}px${adjustStr})`;
};

/**
 * Calculate CSS top position for vertical slider (mobile).
 * Inverted fraction: value=max → top:0%, value=0 → top:100%.
 * This places max (12am/value 24) at the top and min (12am/value 0) at the bottom.
 *
 * @param {number} value - Current slider value (0 to max)
 * @param {number} max - Maximum slider value (typically 24 for hours)
 * @param {number} adjustment - Optional CSS offset in pixels (default: 0)
 * @returns {string} CSS calc() expression safe for use in inline styles
 */
const thumbPositionV = (value, max, adjustment = 0) => {
  if (value < 0 || value > max) {
    console.warn(`thumbPositionV: value ${value} outside range [0, ${max}]`);
  }
  const fraction = (max - value) / max; // inverted
  const adjustStr = adjustment !== 0
    ? ` ${adjustment > 0 ? '+' : '-'} ${Math.abs(adjustment)}px`
    : '';
  return `calc(${fraction} * (100% - ${THUMB_WIDTH}px) + ${THUMB_RADIUS}px${adjustStr})`;
};

const HOURS = [
  { label: '12am', value: 0 },
  { label: 1, value: 1 },
  { label: 2, value: 2 },
  { label: 3, value: 3 },
  { label: 4, value: 4 },
  { label: 5, value: 5 },
  { label: 6, value: 6 },
  { label: 7, value: 7 },
  { label: 8, value: 8 },
  { label: 9, value: 9 },
  { label: 10, value: 10 },
  { label: 11, value: 11 },
  { label: '12pm', value: 12 },
  { label: 1, value: 13 },
  { label: 2, value: 14 },
  { label: 3, value: 15 },
  { label: 4, value: 16 },
  { label: 5, value: 17 },
  { label: 6, value: 18 },
  { label: 7, value: 19 },
  { label: 8, value: 20 },
  { label: 9, value: 21 },
  { label: 10, value: 22 },
  { label: 11, value: 23 },
  { label: '12am', value: 24 }
];

const EVENTS = [
  { eventLabel: 'Doors Open', timeLabel: '5:00', value: 17 },
  { eventLabel: 'Ceremony', timeLabel: '5:30', value: 17.5 },
  { eventLabel: 'Cocktail Hour', timeLabel: '6:00', value: 18 },
  { eventLabel: 'Dinner', timeLabel: '7:00', value: 19 },
  { eventLabel: 'Reception', timeLabel: '8:00', value: 20 },
  { eventLabel: 'La Fin', timeLabel: '11:00', value: 23 }
];

const formatTimeOfDay = (hours) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${m.toString().padStart(2, '0')} ${meridiem}`;
};

export default function Slider({ min = 0, max = 100, value, onChange, step = 1 }) {
  const timelineRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia('(max-width: 768px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value);
    if (onChange) {
      onChange(newValue);
    }
  };

  const handleHourClick = (hourValue) => {
    if (onChange) {
      onChange(hourValue);
    }
  };

  return (
    <div className='slider'>
      <h3>
        <span>Timeline of Events</span>
        <span>Sunday, September 20th, 2026</span>
      </h3>
      <div className='slider__content'>
        <div className='slider__timeline' ref={timelineRef}>
          {HOURS.map((hour) => (
            <button
              key={hour.value}
              className={`slider__label ${Math.round(value) === hour.value ? 'slider__label--active' : ''}`}
              onClick={() => handleHourClick(hour.value)}
              style={{
                [isMobile ? 'top' : 'left']: isMobile
                  ? thumbPositionV(hour.value, 24)
                  : thumbPosition(hour.value, 24)
              }}
            >
              {hour.label}
            </button>
          ))}
        </div>
        <div className='slider__ticks'>
          {Array.from({ length: 49 }, (_, i) => {
            const tickValue = i * 0.5;
            const isHour = i % 2 === 0;
            return (
              <div
                key={i}
                className={`slider__tick ${isHour ? 'slider__tick--hour' : 'slider__tick--half'}`}
                style={{
                  [isMobile ? 'top' : 'left']: isMobile
                    ? thumbPositionV(tickValue, 24)
                    : thumbPosition(tickValue, 24)
                }}
              />
            );
          })}
        </div>
        <div
          className='slider__input-container'
          style={{
            '--slider-percentage': isMobile
              ? thumbPositionV(value, 24, -10)
              : thumbPosition(value, 24, -30)
          }}
        >
          <div className='slider__time-label'>
            {formatTimeOfDay(value)}
          </div>
          <input
            className='slider__input'
            type='range'
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
          />
        </div>
        <div>
          <div className='slider__events'>
            {EVENTS.map((event) => (
              <div
                key={event.eventLabel}
                className='slider__event'
                style={{
                  [isMobile ? 'top' : 'left']: isMobile
                    ? thumbPositionV(event.value, 24)
                    : thumbPosition(event.value, 24)
                }}
                title={event.eventLabel}
                onClick={() => handleHourClick(event.value)}
                role='button'
                tabIndex={0}
              >
                <div className='slider__event-metadata-container'>
                  <div className='slider__event-dot' />
                  <div className='slider__event-label'>{event.eventLabel}</div>
                  <div className='slider__event-label'>{event.timeLabel}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
);
}
