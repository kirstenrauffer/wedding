import '../styles/Navigation.scss';
import WaveText from './WaveText';
import TravelModal from './TravelModal';
import HotelModal from './HotelModal';
import FAQModal from './FAQModal';

export default function Navigation({ openModal, setOpenModal, setIsSceneExpanded }) {
  const handleLinkClick = (e, link) => {
    e.preventDefault();
    setIsSceneExpanded(true); // slider fades, FLIP pins element
    setTimeout(() => {
      setOpenModal(link); // modal opens after slider fades (300ms)
    }, 300);
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
        <ul className='navigation__list'>
          <li>
            <div className='navigation__header-multi-line'>
              <h1 className='ballet-regular'>Kirsten and Israel</h1>
              <p>Join us for a wedding on the Jersey Shore</p>
            </div>
          </li>
          <li>
            <h2><div className='navigation__rounded-full animate-pulse w-4 h-4'></div> <WaveText text='Open for RSVPs until August 20th, 2026' /></h2>
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
      </header>

      <TravelModal isOpen={openModal === 'travel'} onClose={closeModal} onCloseStart={handleCloseStart} closeDelay={0} />
      <HotelModal isOpen={openModal === 'hotel'} onClose={closeModal} onCloseStart={handleCloseStart} closeDelay={0} />
      <FAQModal isOpen={openModal === 'faq'} onClose={closeModal} onCloseStart={handleCloseStart} closeDelay={0} />
    </>
  );
}
