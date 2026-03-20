import '../styles/NavigationDrawer.scss';

export default function NavigationDrawer({ isMenuOpen, setIsMenuOpen, onLinkClick }) {
  const handleLinkClick = (e, link) => {
    e.preventDefault();
    onLinkClick(link);
    setIsMenuOpen(false);
  };

  return (
    <>
      {/* Drawer overlay — only render when open */}
      {isMenuOpen && (
        <div className='navigation__overlay' onClick={() => setIsMenuOpen(false)} />
      )}

      {/* Mobile drawer */}
      <nav className={`navigation__drawer${isMenuOpen ? ' navigation__drawer--open' : ''}`} role="navigation">
        <div className='navigation__drawer-title'>
          <h1 className='ballet-regular'>Kirsten and Israel</h1>
        </div>
        <ul className='navigation__drawer-links'>
          <li><a onClick={(e) => handleLinkClick(e, 'travel')}>Travel</a></li>
          <li><a onClick={(e) => handleLinkClick(e, 'hotel')}>Hotel</a></li>
          <li><a onClick={(e) => handleLinkClick(e, 'faq')}>FAQ</a></li>
        </ul>
      </nav>
    </>
  );
}
