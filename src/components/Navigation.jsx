import '../styles/Navigation.scss';
import WaveText from './WaveText';

export default function Navigation() {
  return (
    <header className='navigation__header'>
      <ul className='navigation__list'>
        <li>
          <div className='navigation__header-multi-line'>
            <h1 className='ballet-regular'>Kirsten and Israel</h1>
            <p>Sunday, September 20th, 2026</p>
          </div>
        </li>
        <li>
          <h2><div className='navigation__rounded-full animate-pulse w-4 h-4'></div> <WaveText text='Open for RSVPs until August 20th, 2026' /></h2>
        </li>
        <li>
          <div>
            <ul className='navigation__additional-links'>
              <li><a href="#">Travel +</a></li>
              <li><a href="#">Hotel +</a></li>
              <li><a href="#">FAQ +</a></li>
            </ul>
          </div>
        </li>
      </ul>
    </header>
  );
}
