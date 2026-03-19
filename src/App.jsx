import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Navigation from './components/Navigation';
import './styles/global.scss';
import './styles/App.scss';

function App() {
  const [openModal, setOpenModal] = useState(null);
  const [isSceneExpanded, setIsSceneExpanded] = useState(false);

  return (
    <BrowserRouter>
      <div className="app">
        <Navigation openModal={openModal} setOpenModal={setOpenModal} setIsSceneExpanded={setIsSceneExpanded} />
        <main className="app__main">
          <Routes>
            <Route path="/" element={<Home isModalOpen={isSceneExpanded} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
