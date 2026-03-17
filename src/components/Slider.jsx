import { useRef, useEffect, useState } from 'react';
import '../styles/Slider.scss';

const HOURS = [
  { label: 12, value: 0 },
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
  { label: 12, value: 12 },
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
  { label: 12, value: 24 }
];

const EVENTS = [
  { eventLabel: 'Doors Open', timeLabel: '5:00', value: 17 },
  { eventLabel: 'Ceremony', timeLabel: '5:30', value: 17.5 },
  { eventLabel: 'Cocktail Hour', timeLabel: '6:00', value: 18 },
  { eventLabel: 'Dinner', timeLabel: '7:00', value: 19 },
  { eventLabel: 'Reception', timeLabel: '8:00', value: 20 },
  { eventLabel: 'La Fin', timeLabel: '11:00', value: 23 }
];

export default function Slider({ min = 0, max = 100, value, onChange, step = 1 }) {
  const timelineRef = useRef(null);
  const [labelWidth, setLabelWidth] = useState(0);

  useEffect(() => {
    const calculateWidth = () => {
      if (timelineRef.current) {
        const timelineWidth = timelineRef.current.offsetWidth;
        const calculatedWidth = timelineWidth / HOURS.length;
        setLabelWidth(calculatedWidth);
      }
    };

    calculateWidth();
    window.addEventListener('resize', calculateWidth);
    return () => window.removeEventListener('resize', calculateWidth);
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
        Timeline of Events
      </h3>
      <div>
        <div className='slider__timeline' ref={timelineRef}>
          {HOURS.map((hour) => (
            <button
              key={hour.value}
              className={`slider__label ${Math.round(value) === hour.value ? 'slider__label--active' : ''}`}
              onClick={() => handleHourClick(hour.value)}
              style={{ width: `${labelWidth}px` }}
            >
              {hour.label}
            </button>
          ))}
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
        <div>
          <div className='slider__events'>
            {EVENTS.map((event) => (
              <div
                key={event.eventLabel}
                className='slider__event'
                style={{ left: `${(event.value / 24) * 100}%` }}
                title={event.eventLabel}
              >
                <div className='slider__event-dot' />
                <div className='slider__event-label'>{event.eventLabel}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
);
}
