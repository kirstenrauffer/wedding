import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Navigation from './components/Navigation';
import NavigationDrawer from './components/NavigationDrawer';
import './styles/global.scss';
import './styles/App.scss';

function App() {
  const [openModal, setOpenModal] = useState(null);
  const [isSceneExpanded, setIsSceneExpanded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (isSceneExpanded) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  }, [isSceneExpanded]);

  return (
    <BrowserRouter>
      <div className="app">
        <Navigation
          openModal={openModal}
          setOpenModal={setOpenModal}
          setIsSceneExpanded={setIsSceneExpanded}
          isMenuOpen={isMenuOpen}
          setIsMenuOpen={setIsMenuOpen}
        />
        <div className="app__content-wrapper">
          <NavigationDrawer
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            onLinkClick={(link) => {
              setIsSceneExpanded(true);
              setTimeout(() => {
                setOpenModal(link);
              }, 450);
            }}
          />
          <main className="app__main">
            <Routes>
              <Route path="/" element={<Home isModalOpen={isSceneExpanded} />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
