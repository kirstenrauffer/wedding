import OceanScene from '../components/OceanScene';
import Slider from '../components/Slider';

import '../styles/Ocean.scss';

function Home({ isModalOpen }) {
  return (
    <section className="home">
      <OceanScene isModalOpen={isModalOpen} />
    </section>
  );
}

export default Home;
