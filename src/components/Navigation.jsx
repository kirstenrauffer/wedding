import '../styles/Navigation.scss';
import { createPortal } from 'react-dom';
import WaveText from './WaveText';
import TravelModal from './TravelModal';
import HotelModal from './HotelModal';
import FAQModal from './FAQModal';

export default function Navigation({ openModal, setOpenModal, setIsSceneExpanded, isMenuOpen, setIsMenuOpen }) {
  const handleLinkClick = (e, link) => {
    e.preventDefault();
    setIsSceneExpanded(true); // slider fades, FLIP pins element
    setTimeout(() => {
      setOpenModal(link); // modal opens after ocean expand completes (450ms)
    }, 450);
  };

  const handleCloseStart = () => {
    setIsSceneExpanded(false); // ocean FLIP collapse starts immediately
  };

  const closeModal = () => {
    setOpenModal(null); // called after modal animation completes
  };

  return (
    <>
      <header className='navigation__header'>
        {/* Mobile hamburger/close button */}
        <button
          className={`navigation__hamburger${isMenuOpen ? ' navigation__hamburger--open' : ''}`}
          onClick={() => setIsMenuOpen(prev => !prev)}
          aria-label={isMenuOpen ? "Close menu" : "Toggle menu"}
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? (
            <span className="navigation__hamburger-close">{'\u00A0✕\u00A0'}</span>
          ) : (
            <>
              <span className="navigation__hamburger-line navigation__hamburger-line--top" />
              <span className="navigation__hamburger-line navigation__hamburger-line--bottom" />
            </>
          )}
        </button>

        {/* Desktop three-column layout — hidden on mobile */}
        <ul className='navigation__list navigation__list--desktop'>
          <li>
            <div className='navigation__header-multi-line'>
              <h1 className='ballet-regular'>Kirsten and Israel</h1>
              <p>Join us for a wedding on the Jersey Shore</p>
            </div>
          </li>
          <li>
            <div className='navigation__rsvp-container'>
              <div className='neon-sign'>
                <span className='neon-text'>OPEN</span>
              </div>
              <h2><div className='navigation__rounded-full animate-pulse w-4 h-4'></div> <WaveText text='Open for RSVPs until August 20th, 2026' /></h2>
            </div>
          </li>
          <li>
            <div>
              <ul className='navigation__additional-links'>
                <li><a href="#" onClick={(e) => handleLinkClick(e, 'travel')}>Travel +</a></li>
                <li><a href="#" onClick={(e) => handleLinkClick(e, 'hotel')}>Hotel +</a></li>
                <li><a href="#" onClick={(e) => handleLinkClick(e, 'faq')}>FAQ +</a></li>
              </ul>
            </div>
          </li>
        </ul>

        {/* Mobile center RSVP — hidden on desktop */}
        <div className='navigation__rsvp-mobile'>
          <div className='navigation__rsvp-container'>
            <div className='neon-sign'>
              <span className='neon-text'>OPEN</span>
            </div>
            <h2><div className='navigation__rounded-full animate-pulse w-4 h-4'></div> <WaveText text='Open for RSVPs until 8/20/26' /></h2>
          </div>
        </div>
      </header>

      {createPortal(
        <TravelModal isOpen={openModal === 'travel'} onClose={closeModal} onCloseStart={handleCloseStart} closeDelay={0} />,
        document.body
      )}
      {createPortal(
        <HotelModal isOpen={openModal === 'hotel'} onClose={closeModal} onCloseStart={handleCloseStart} closeDelay={0} />,
        document.body
      )}
      {createPortal(
        <FAQModal isOpen={openModal === 'faq'} onClose={closeModal} onCloseStart={handleCloseStart} closeDelay={0} />,
        document.body
      )}
    </>
  );
}
