import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import './styles/global.scss';
import './styles/App.scss';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        {/* <header className="app__header">
          <h1>Our Wedding</h1>
        </header> */}
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
