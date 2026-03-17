import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Navigation from './components/Navigation';
import './styles/global.scss';
import './styles/App.scss';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navigation />
        <main className="app__main">
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
