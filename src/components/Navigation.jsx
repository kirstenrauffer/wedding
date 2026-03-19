import '../styles/Navigation.scss';
import WaveText from './WaveText';
import TravelModal from './TravelModal';
import HotelModal from './HotelModal';
import FAQModal from './FAQModal';

export default function Navigation({ openModal, setOpenModal, setIsSceneExpanded }) {
  const handleLinkClick = (e, link) => {
    e.preventDefault();
    setIsSceneExpanded(true);
    setTimeout(() => {
      setOpenModal(link);
    }, 300);
  };

  const closeModal = () => {
    setOpenModal(null);
    setTimeout(() => {
      setIsSceneExpanded(false);
    }, 100);
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

      <TravelModal isOpen={openModal === 'travel'} onClose={closeModal} />
      <HotelModal isOpen={openModal === 'hotel'} onClose={closeModal} />
      <FAQModal isOpen={openModal === 'faq'} onClose={closeModal} />
    </>
  );
}
