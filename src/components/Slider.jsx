import { useRef } from 'react';
import '../styles/Slider.scss';

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
      <div>
        <div className='slider__timeline' ref={timelineRef}>
          {HOURS.map((hour) => (
            <button
              key={hour.value}
              className={`slider__label ${Math.round(value) === hour.value ? 'slider__label--active' : ''}`}
              onClick={() => handleHourClick(hour.value)}
              style={{ left: `${(hour.value / 24) * 100}%` }}
            >
              {hour.label}
            </button>
          ))}
        </div>
        <div className='slider__ticks'>
          {Array.from({ length: 49 }, (_, i) => {
            const tickValue = i * 0.5;
            const percentage = (tickValue / 24) * 100;
            const isHour = i % 2 === 0;
            return (
              <div
                key={i}
                className={`slider__tick ${isHour ? 'slider__tick--hour' : 'slider__tick--half'}`}
                style={{ left: `${percentage}%` }}
              />
            );
          })}
        </div>
        <div
          className='slider__input-container'
          style={{ '--slider-percentage': `${(value / 24) * 100}%` }}
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
                style={{ left: `${(event.value / 24) * 100}%` }}
                title={event.eventLabel}
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
